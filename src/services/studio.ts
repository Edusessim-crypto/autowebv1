import { randomUUID } from "node:crypto";
import { and, eq, desc, sql, inArray } from "drizzle-orm";
import { getDb } from "@/server/db";
import {
  contentProjects,
  renderJobs,
  generatedAssets,
  vehicles,
  vehicleMedia,
  auditLogs,
} from "@/server/schema";
import type { TenantContext } from "@/server/auth";
import { assertPermission, AppError } from "@/domain/policies";
import { canWrite } from "@/domain/plans";
import { getStorage } from "@/server/storage";
import {
  DEFAULT_TEMPLATE_KEY,
  DEFAULT_TEMPLATE_VERSION,
  MAX_PHOTOS_PER_PROJECT,
  MIN_PHOTOS_PER_PROJECT,
  canUseCustomBrandColors,
  renderErrorMessages,
  type TemplateVariant,
  type RenderErrorCode,
} from "@/domain/studio";
import {
  submitRender,
  fetchResult,
  rerenderCard,
  isWorkerConfigured,
  WorkerUnavailable,
  type RenderResult,
} from "@/server/render-worker";

// O worker só precisa ler a foto pelo tempo do job.
const SIGNED_URL_TTL = 900;

export type CreateProjectInput = {
  vehicleId: string;
  mediaIds: string[];
  variant?: TemplateVariant;
};

async function assertVehicle(ctx: TenantContext, vehicleId: string) {
  const db = await getDb();
  const [vehicle] = await db
    .select()
    .from(vehicles)
    .where(
      and(
        eq(vehicles.id, vehicleId),
        eq(vehicles.dealershipId, ctx.dealership.id),
      ),
    );
  if (!vehicle) throw new AppError("Veículo não encontrado.", 404);
  return vehicle;
}

// As mídias precisam ser do veículo E da revenda: um mediaId de outra
// revenda não pode entrar num projeto, mesmo forjando a requisição.
async function assertMedia(
  ctx: TenantContext,
  vehicleId: string,
  mediaIds: string[],
) {
  if (mediaIds.length < MIN_PHOTOS_PER_PROJECT)
    throw new AppError("Selecione ao menos uma foto.");
  if (mediaIds.length > MAX_PHOTOS_PER_PROJECT)
    throw new AppError(`Selecione no máximo ${MAX_PHOTOS_PER_PROJECT} fotos.`);
  const db = await getDb();
  const rows = await db
    .select()
    .from(vehicleMedia)
    .where(
      and(
        eq(vehicleMedia.dealershipId, ctx.dealership.id),
        eq(vehicleMedia.vehicleId, vehicleId),
        inArray(vehicleMedia.id, mediaIds),
      ),
    );
  if (rows.length !== mediaIds.length)
    throw new AppError("Foto não encontrada neste veículo.", 404);
  // A ordem pedida pelo usuário é a que vale.
  const byId = new Map(rows.map((row) => [row.id, row]));
  return mediaIds.map((id) => byId.get(id)!);
}

export async function createProject(
  ctx: TenantContext,
  input: CreateProjectInput,
) {
  assertPermission(ctx.membership.role, "studio:manage");
  if (!canWrite(ctx.dealership))
    throw new AppError("Seu período de teste terminou.", 402);
  await assertVehicle(ctx, input.vehicleId);
  const media = await assertMedia(ctx, input.vehicleId, input.mediaIds);

  const db = await getDb();
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(contentProjects).values({
      id,
      dealershipId: ctx.dealership.id,
      vehicleId: input.vehicleId,
      createdById: ctx.user.id,
      templateKey: DEFAULT_TEMPLATE_KEY,
      templateVersion: DEFAULT_TEMPLATE_VERSION,
      templateVariant: input.variant || "STANDARD",
      status: "DRAFT",
      configuration: { mediaIds: media.map((m) => m.id) },
    });
    await tx.insert(auditLogs).values({
      id: randomUUID(),
      dealershipId: ctx.dealership.id,
      userId: ctx.user.id,
      entityId: id,
      event: "content_project.created",
    });
  });
  return id;
}

export async function getProject(ctx: TenantContext, id: string) {
  assertPermission(ctx.membership.role, "studio:read");
  const db = await getDb();
  const [project] = await db
    .select()
    .from(contentProjects)
    .where(
      and(
        eq(contentProjects.id, id),
        eq(contentProjects.dealershipId, ctx.dealership.id),
      ),
    );
  if (!project) throw new AppError("Projeto não encontrado.", 404);
  const assets = await db
    .select()
    .from(generatedAssets)
    .where(eq(generatedAssets.contentProjectId, id))
    .orderBy(generatedAssets.position);
  const jobs = await db
    .select()
    .from(renderJobs)
    .where(eq(renderJobs.contentProjectId, id))
    .orderBy(desc(renderJobs.attempt));
  return { project, assets, jobs };
}

export async function listProjects(
  ctx: TenantContext,
  options: { vehicleId?: string; page?: number } = {},
) {
  assertPermission(ctx.membership.role, "studio:read");
  const db = await getDb();
  const filters = [eq(contentProjects.dealershipId, ctx.dealership.id)];
  if (options.vehicleId)
    filters.push(eq(contentProjects.vehicleId, options.vehicleId));
  const condition = and(...filters);
  const page = Math.max(1, Math.floor(options.page || 1));
  const [total] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentProjects)
    .where(condition);
  const items = await db
    .select()
    .from(contentProjects)
    .where(condition)
    .orderBy(desc(contentProjects.createdAt))
    .limit(20)
    .offset((page - 1) * 20);
  return { items, total: total.count, page };
}

async function buildPayload(
  ctx: TenantContext,
  projectId: string,
  jobId: string,
) {
  const db = await getDb();
  const [project] = await db
    .select()
    .from(contentProjects)
    .where(
      and(
        eq(contentProjects.id, projectId),
        eq(contentProjects.dealershipId, ctx.dealership.id),
      ),
    );
  if (!project) throw new AppError("Projeto não encontrado.", 404);
  const vehicle = await assertVehicle(ctx, project.vehicleId);
  const mediaIds = (project.configuration.mediaIds as string[]) || [];
  const media = await assertMedia(ctx, project.vehicleId, mediaIds);

  const storage = getStorage();
  if (!storage.signedUrl)
    throw new AppError(
      "O storage atual não emite URLs temporárias para o gerador.",
      503,
    );
  const photos = await Promise.all(
    media.map(async (item, index) => ({
      mediaId: item.id,
      order: index + 1,
      sourceUrl: await storage.signedUrl!(item.storageKey, SIGNED_URL_TTL),
      isCover: item.isCover,
    })),
  );

  // A logo da revenda é servida pela própria AutoWeb, com URL temporária.
  const logoUrl = ctx.dealership.logoUrl
    ? await storage.signedUrl!(ctx.dealership.logoUrl, SIGNED_URL_TTL).catch(
        () => null,
      )
    : null;
  // Cor personalizada é direito de plano; fora dele, o template usa o neutro.
  const custom = canUseCustomBrandColors(ctx.dealership);
  return {
    version: 1,
    jobId,
    projectId,
    dealershipId: ctx.dealership.id,
    branding: {
      name: ctx.dealership.tradeName,
      logoUrl,
      phone: ctx.dealership.phone || "",
      whatsapp: ctx.dealership.phone || "",
      primaryColor: custom ? ctx.dealership.primaryColor : "",
      secondaryColor: "",
    },
    vehicle: {
      id: vehicle.id,
      brand: vehicle.brand,
      model: vehicle.model,
      version: vehicle.version,
      yearManufacture: vehicle.yearManufacture,
      yearModel: vehicle.yearModel,
      mileage: vehicle.mileage,
      transmission: vehicle.transmission,
      fuel: vehicle.fuel,
      color: vehicle.color,
      price: vehicle.price,
      previousPrice: null,
      type: "auto" as const,
    },
    photos,
    template: {
      key: project.templateKey,
      version: project.templateVersion,
      variant: project.templateVariant,
    },
    settings: {
      vehicleType: "auto" as const,
      ordering: "as_provided" as const,
      format: "feed" as const,
    },
  };
}

export async function startRender(ctx: TenantContext, projectId: string) {
  assertPermission(ctx.membership.role, "studio:manage");
  if (!canWrite(ctx.dealership))
    throw new AppError("Seu período de teste terminou.", 402);
  if (!isWorkerConfigured())
    throw new AppError("O gerador de conteúdo não está configurado.", 503);

  const db = await getDb();
  const [{ attempts }] = await db
    .select({ attempts: sql<number>`count(*)::int` })
    .from(renderJobs)
    .where(eq(renderJobs.contentProjectId, projectId));

  const jobId = randomUUID();
  const payload = await buildPayload(ctx, projectId, jobId);

  await db.transaction(async (tx) => {
    await tx.insert(renderJobs).values({
      id: jobId,
      dealershipId: ctx.dealership.id,
      contentProjectId: projectId,
      attempt: attempts + 1,
      status: "QUEUED",
      startedAt: new Date(),
    });
    await tx
      .update(contentProjects)
      .set({ status: "QUEUED", errorMessage: "", updatedAt: new Date() })
      .where(eq(contentProjects.id, projectId));
    await tx.insert(auditLogs).values({
      id: randomUUID(),
      dealershipId: ctx.dealership.id,
      userId: ctx.user.id,
      entityId: projectId,
      event: "render_job.started",
    });
  });

  try {
    await submitRender(payload);
    await db
      .update(renderJobs)
      .set({ status: "PROCESSING" })
      .where(eq(renderJobs.id, jobId));
    await db
      .update(contentProjects)
      .set({ status: "PROCESSING", updatedAt: new Date() })
      .where(eq(contentProjects.id, projectId));
  } catch (error) {
    const message =
      error instanceof WorkerUnavailable
        ? "O gerador está indisponível no momento."
        : "Não foi possível iniciar a geração.";
    await failJob(ctx, jobId, projectId, "INTERNAL_ERROR", message);
    throw new AppError(message, 503);
  }
  return jobId;
}

async function failJob(
  ctx: TenantContext,
  jobId: string,
  projectId: string,
  code: RenderErrorCode,
  message: string,
) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(renderJobs)
      .set({
        status: "FAILED",
        errorCode: code,
        errorMessage: message.slice(0, 300),
        completedAt: new Date(),
      })
      .where(eq(renderJobs.id, jobId));
    await tx
      .update(contentProjects)
      .set({
        status: "FAILED",
        errorMessage: renderErrorMessages[code],
        updatedAt: new Date(),
      })
      .where(eq(contentProjects.id, projectId));
    await tx.insert(auditLogs).values({
      id: randomUUID(),
      dealershipId: ctx.dealership.id,
      userId: ctx.user.id,
      entityId: projectId,
      event: "content_project.failed",
    });
  });
}

/** Consulta o worker e grava o resultado. O estado vive no banco. */
export async function syncJob(ctx: TenantContext, jobId: string) {
  assertPermission(ctx.membership.role, "studio:read");
  const db = await getDb();
  const [job] = await db
    .select()
    .from(renderJobs)
    .where(
      and(
        eq(renderJobs.id, jobId),
        eq(renderJobs.dealershipId, ctx.dealership.id),
      ),
    );
  if (!job) throw new AppError("Job não encontrado.", 404);
  if (job.status === "COMPLETED" || job.status === "FAILED") return job;

  let result: RenderResult;
  try {
    result = await fetchResult(jobId);
  } catch {
    return job; // ainda processando; o estado no banco permanece
  }
  await persistResult(ctx, job.contentProjectId, jobId, result);
  const [updated] = await db
    .select()
    .from(renderJobs)
    .where(eq(renderJobs.id, jobId));
  return updated;
}

export async function persistResult(
  ctx: TenantContext,
  projectId: string,
  jobId: string,
  result: RenderResult,
) {
  const db = await getDb();
  if (result.status === "FAILED") {
    await failJob(
      ctx,
      jobId,
      projectId,
      (result.errorCode as RenderErrorCode) || "INTERNAL_ERROR",
      result.errorMessage || "Falha na geração.",
    );
    return;
  }
  const projectStatus = result.status === "REVIEW" ? "REVIEW" : "COMPLETED";
  await db.transaction(async (tx) => {
    // Idempotência: reprocessar o mesmo job não duplica assets.
    await tx
      .delete(generatedAssets)
      .where(eq(generatedAssets.renderJobId, jobId));
    for (const card of result.cards) {
      await tx.insert(generatedAssets).values({
        id: randomUUID(),
        dealershipId: ctx.dealership.id,
        contentProjectId: projectId,
        renderJobId: jobId,
        sourceMediaId: card.sourceMediaId || null,
        position: card.position,
        storageKey: card.storageKey,
        width: card.width,
        height: card.height,
        status: card.status,
        framing: card.framing as unknown as Record<string, number>,
        metrics: card.metrics,
        issues: card.issues,
        detectedVehicleType: card.detectedVehicleType,
        photoGroup: card.group,
        manuallyAdjusted: card.manuallyAdjusted,
      });
    }
    await tx
      .update(renderJobs)
      .set({
        status: "COMPLETED",
        engineVersion: result.engineVersion,
        completedAt: new Date(),
      })
      .where(eq(renderJobs.id, jobId));
    await tx
      .update(contentProjects)
      .set({
        status: projectStatus,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(contentProjects.id, projectId));
    await tx.insert(auditLogs).values({
      id: randomUUID(),
      dealershipId: ctx.dealership.id,
      userId: ctx.user.id,
      entityId: projectId,
      event:
        projectStatus === "REVIEW"
          ? "content_project.needs_review"
          : "content_project.completed",
    });
  });
}

/** Refaz um card com enquadramento manual, sem tocar nos demais. */
export async function adjustCard(
  ctx: TenantContext,
  assetId: string,
  framing: { zoom: number; horizontalAnchor: number; verticalAnchor: number },
) {
  assertPermission(ctx.membership.role, "studio:manage");
  const db = await getDb();
  const [asset] = await db
    .select()
    .from(generatedAssets)
    .where(
      and(
        eq(generatedAssets.id, assetId),
        eq(generatedAssets.dealershipId, ctx.dealership.id),
      ),
    );
  if (!asset) throw new AppError("Peça não encontrada.", 404);
  if (!asset.sourceMediaId)
    throw new AppError("Esta peça não tem foto de origem.", 400);

  const payload = await buildPayload(
    ctx,
    asset.contentProjectId,
    asset.renderJobId || assetId,
  );
  const photo = payload.photos.find((p) => p.mediaId === asset.sourceMediaId);
  if (!photo) throw new AppError("Foto de origem indisponível.", 404);

  // O rerender leva uma foto só, não a lista do lote.
  const single = { ...payload, photos: undefined, photo, framing };
  delete (single as { photos?: unknown }).photos;
  const result = await rerenderCard(single);
  const card = result.cards[0];
  if (!card) throw new AppError("Não foi possível regerar a peça.", 500);

  await db.transaction(async (tx) => {
    await tx
      .update(generatedAssets)
      .set({
        storageKey: card.storageKey,
        framing: card.framing as unknown as Record<string, number>,
        metrics: card.metrics,
        issues: card.issues,
        status: "MANUAL",
        manuallyAdjusted: true,
      })
      .where(eq(generatedAssets.id, assetId));
    await tx.insert(auditLogs).values({
      id: randomUUID(),
      dealershipId: ctx.dealership.id,
      userId: ctx.user.id,
      entityId: asset.contentProjectId,
      event: "manual_adjustment.saved",
    });
  });
  return assetId;
}

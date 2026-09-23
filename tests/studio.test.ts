import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/server/db";
import {
  users,
  dealerships,
  memberships,
  vehicleMedia,
  generatedAssets,
} from "../src/server/schema";
import type { TenantContext } from "../src/server/auth";
import { saveVehicle } from "../src/services/vehicles";
import {
  createProject,
  getProject,
  listProjects,
  persistResult,
} from "../src/services/studio";
import { can } from "../src/domain/policies";
import {
  canUseCustomBrandColors,
  canUseAdvancedTemplates,
  MAX_PHOTOS_PER_PROJECT,
} from "../src/domain/studio";

let directory: string;

const vehicle = {
  brand: "Marca teste",
  model: "Modelo teste",
  version: "",
  yearManufacture: 2022,
  yearModel: 2023,
  mileage: 24000,
  transmission: "Automático",
  fuel: "Flex",
  color: "Prata",
  price: 85000,
  plate: "",
  description: "",
  options: [],
  status: "AVAILABLE",
};

async function fixture(role: "ADMIN" | "MANAGER" | "SALESPERSON" = "ADMIN") {
  const db = await getDb();
  const [user] = await db
    .insert(users)
    .values({
      id: randomUUID(),
      name: "Usuário teste",
      email: randomUUID() + "@example.test",
      passwordHash: "unused",
    })
    .returning();
  const [dealership] = await db
    .insert(dealerships)
    .values({
      id: randomUUID(),
      tradeName: "Revenda teste",
      slug: randomUUID(),
      cnpj: randomUUID(),
      phone: "11999999999",
      city: "São Paulo",
      state: "SP",
      trialEndsAt: new Date(Date.now() + 86400000),
    })
    .returning();
  const [membership] = await db
    .insert(memberships)
    .values({
      id: randomUUID(),
      userId: user.id,
      dealershipId: dealership.id,
      role,
    })
    .returning();
  return { user, dealership, membership } satisfies TenantContext;
}

/** Insere mídia diretamente: o upload real exige sharp e storage. */
async function addMedia(ctx: TenantContext, vehicleId: string, count: number) {
  const db = await getDb();
  const ids: string[] = [];
  for (let index = 0; index < count; index++) {
    const id = randomUUID();
    await db.insert(vehicleMedia).values({
      id,
      dealershipId: ctx.dealership.id,
      vehicleId,
      storageKey: `${ctx.dealership.id}/vehicles/${id}.webp`,
      thumbnailKey: `${ctx.dealership.id}/vehicles/${id}-thumb.webp`,
      position: index,
      isCover: index === 0,
    });
    ids.push(id);
  }
  return ids;
}

test("Studio: isolamento por revenda em projetos e peças", async () => {
  directory = await mkdtemp(path.join(tmpdir(), "autoweb-studio-"));
  process.env.LOCAL_DATA_DIR = directory;
  const a = await fixture();
  const b = await fixture();

  const vehicleId = (await saveVehicle(a, vehicle))!;
  const mediaIds = await addMedia(a, vehicleId, 3);
  const projectId = await createProject(a, { vehicleId, mediaIds });

  const mine = await getProject(a, projectId);
  assert.equal(mine.project.vehicleId, vehicleId);
  assert.deepEqual(mine.project.configuration.mediaIds, mediaIds);

  // A outra revenda não vê nem alcança o projeto.
  assert.equal((await listProjects(b)).total, 0);
  await assert.rejects(getProject(b, projectId), /não encontrado/);

  // Nem consegue criar projeto com o veículo alheio.
  await assert.rejects(
    createProject(b, { vehicleId, mediaIds }),
    /não encontrado/,
  );
});

test("Studio: mídia de outro veículo ou revenda é recusada", async () => {
  const a = await fixture();
  const b = await fixture();

  const vehicleA = (await saveVehicle(a, vehicle))!;
  const otherVehicleA = (await saveVehicle(a, vehicle))!;
  const vehicleB = (await saveVehicle(b, vehicle))!;

  const mediaA = await addMedia(a, vehicleA, 2);
  const mediaOther = await addMedia(a, otherVehicleA, 1);
  const mediaB = await addMedia(b, vehicleB, 1);

  // Mídia de outro veículo da MESMA revenda não entra.
  await assert.rejects(
    createProject(a, {
      vehicleId: vehicleA,
      mediaIds: [...mediaA, ...mediaOther],
    }),
    /não encontrada/,
  );
  // Mídia de OUTRA revenda também não.
  await assert.rejects(
    createProject(a, { vehicleId: vehicleA, mediaIds: [...mediaA, ...mediaB] }),
    /não encontrada/,
  );
  // O caminho legítimo funciona.
  assert.ok(await createProject(a, { vehicleId: vehicleA, mediaIds: mediaA }));
});

test("Studio: vendedor não gera conteúdo, mas pode acompanhar", async () => {
  const admin = await fixture();
  const vehicleId = (await saveVehicle(admin, vehicle))!;
  const mediaIds = await addMedia(admin, vehicleId, 1);

  const seller: TenantContext = {
    ...admin,
    membership: { ...admin.membership, role: "SALESPERSON" },
  };
  assert.equal(can("SALESPERSON", "studio:read"), true);
  assert.equal(can("SALESPERSON", "studio:manage"), false);
  await assert.rejects(
    createProject(seller, { vehicleId, mediaIds }),
    /permissão/,
  );
  // Ler continua permitido.
  const projectId = await createProject(admin, { vehicleId, mediaIds });
  assert.equal((await getProject(seller, projectId)).project.id, projectId);
});

test("Studio: limites de fotos por projeto", async () => {
  const ctx = await fixture();
  const vehicleId = (await saveVehicle(ctx, vehicle))!;
  const mediaIds = await addMedia(ctx, vehicleId, 2);

  await assert.rejects(
    createProject(ctx, { vehicleId, mediaIds: [] }),
    /ao menos uma foto/,
  );
  const tooMany = Array.from({ length: MAX_PHOTOS_PER_PROJECT + 1 }, () =>
    randomUUID(),
  );
  await assert.rejects(
    createProject(ctx, { vehicleId, mediaIds: tooMany }),
    /no máximo/,
  );
  assert.ok(await createProject(ctx, { vehicleId, mediaIds }));
});

test("Studio: resultado do worker é persistido com metadados", async () => {
  const ctx = await fixture();
  const db = await getDb();
  const vehicleId = (await saveVehicle(ctx, vehicle))!;
  const mediaIds = await addMedia(ctx, vehicleId, 2);
  const projectId = await createProject(ctx, { vehicleId, mediaIds });

  const jobId = randomUUID();
  await db.insert((await import("../src/server/schema")).renderJobs).values({
    id: jobId,
    dealershipId: ctx.dealership.id,
    contentProjectId: projectId,
    attempt: 1,
    status: "PROCESSING",
  });

  await persistResult(ctx, projectId, jobId, {
    jobId,
    status: "REVIEW",
    engineVersion: "carmulti-v7-autoweb-1",
    templateKey: "autoweb-feed",
    templateVersion: 1,
    resolvedVehicleType: "carro",
    cards: [
      {
        sourceMediaId: mediaIds[0],
        position: 1,
        storageKey: `dealerships/${ctx.dealership.id}/content/${projectId}/${jobId}/card-01.png`,
        width: 1080,
        height: 1350,
        group: "frente",
        detectedVehicleType: "carro",
        status: "OK",
        framing: { zoom: 1.83, horizontalAnchor: 0.51, verticalAnchor: 0.79 },
        metrics: { largura: 0.94, altura: 0.79, margem_inferior: 0.045 },
        issues: [],
        manuallyAdjusted: false,
      },
      {
        sourceMediaId: mediaIds[1],
        position: 2,
        storageKey: `dealerships/${ctx.dealership.id}/content/${projectId}/${jobId}/card-02.png`,
        width: 1080,
        height: 1350,
        group: "traseira",
        detectedVehicleType: "carro",
        status: "NEEDS_REVIEW",
        framing: { zoom: 1.2, horizontalAnchor: 0.5, verticalAnchor: 0.6 },
        metrics: { largura: 0.5, altura: 0.4, margem_inferior: 0.2 },
        issues: ["carro pequeno no quadro"],
        manuallyAdjusted: false,
      },
    ],
    stats: {
      totalPhotos: 2,
      generatedCards: 2,
      reviewCards: 1,
      durationMs: 4200,
    },
    errorCode: null,
    errorMessage: null,
  });

  const saved = await getProject(ctx, projectId);
  // Uma peça com QC reprovado leva o projeto a revisão, não a falha.
  assert.equal(saved.project.status, "REVIEW");
  assert.equal(saved.assets.length, 2);

  const first = saved.assets[0];
  assert.equal(first.sourceMediaId, mediaIds[0], "o vínculo com a foto fica");
  assert.equal(first.framing.zoom, 1.83, "o enquadramento é preservado");
  assert.equal(first.detectedVehicleType, "carro");
  assert.equal(first.photoGroup, "frente");
  assert.equal(saved.assets[1].issues[0], "carro pequeno no quadro");
  assert.equal(saved.jobs[0].engineVersion, "carmulti-v7-autoweb-1");

  // Outra revenda não enxerga as peças.
  const other = await fixture();
  const theirs = await db
    .select()
    .from(generatedAssets)
    .where(
      (await import("drizzle-orm")).eq(
        generatedAssets.dealershipId,
        other.dealership.id,
      ),
    );
  assert.equal(theirs.length, 0);
});

test("Studio: direitos de plano vêm do entitlement central", () => {
  const base = {
    billingCycle: "MONTHLY",
    subscriptionStatus: "ACTIVE",
    trialEndsAt: new Date(Date.now() + 86400000),
  };
  assert.equal(canUseCustomBrandColors({ ...base, plan: "START" }), false);
  assert.equal(canUseCustomBrandColors({ ...base, plan: "PRO" }), true);
  assert.equal(canUseCustomBrandColors({ ...base, plan: "PERFORMANCE" }), true);
  assert.equal(canUseAdvancedTemplates({ ...base, plan: "PRO" }), false);
  assert.equal(canUseAdvancedTemplates({ ...base, plan: "PERFORMANCE" }), true);
});

test("Studio: gerar conteúdo não consome cota de veículos", async () => {
  const ctx = await fixture();
  const db = await getDb();
  const vehicleId = (await saveVehicle(ctx, vehicle))!;
  const mediaIds = await addMedia(ctx, vehicleId, 1);

  const { usage } = await import("../src/server/schema");
  const before = await db.select().from(usage);
  await createProject(ctx, { vehicleId, mediaIds });
  await createProject(ctx, { vehicleId, mediaIds });
  const after = await db.select().from(usage);

  const count = (rows: typeof before) =>
    rows
      .filter((r) => r.dealershipId === ctx.dealership.id)
      .reduce((sum, r) => sum + r.vehicleCount, 0);
  assert.equal(count(after), count(before), "o veículo já foi contabilizado");
  assert.equal((await listProjects(ctx)).total, 2);
});

after(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

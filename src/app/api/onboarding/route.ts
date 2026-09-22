import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { users, dealerships, memberships, sessions } from "@/server/schema";
import { assertOrigin, jsonBody, failure } from "@/server/http";
import { dealershipSchema } from "@/domain/validation";
import { AppError } from "@/domain/policies";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const ctx = await requireUser();
    const data = dealershipSchema.parse(await jsonBody(request));
    const db = await getDb();
    await db.transaction(async (tx) => {
      await tx
        .select()
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .for("update");
      const existing = await tx
        .select()
        .from(memberships)
        .where(eq(memberships.userId, ctx.user.id));
      if (existing.length)
        throw new AppError("Sua revenda já está cadastrada.", 409);
      const duplicate = await tx
        .select({ id: dealerships.id })
        .from(dealerships)
        .where(eq(dealerships.cnpj, data.cnpj));
      if (duplicate.length)
        throw new AppError(
          "CNPJ já cadastrado. Entre com a conta responsável.",
          409,
        );
      const id = randomUUID();
      const slug =
        data.tradeName
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 60) +
        "-" +
        id.slice(0, 6);
      await tx.insert(dealerships).values({
        ...data,
        id,
        slug,
        trialEndsAt: new Date(Date.now() + 7 * 86400000),
      });
      await tx.insert(memberships).values({
        id: randomUUID(),
        userId: ctx.user.id,
        dealershipId: id,
        role: "ADMIN",
      });
      await tx
        .update(sessions)
        .set({ dealershipId: id })
        .where(
          and(
            eq(sessions.tokenHash, ctx.session.tokenHash),
            eq(sessions.userId, ctx.user.id),
          ),
        );
    });
    return NextResponse.json({ redirect: "/painel" });
  } catch (error) {
    return failure(error);
  }
}

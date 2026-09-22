import { randomUUID, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "@/server/db";
import { users, sessions, memberships, loginAttempts } from "@/server/schema";
import {
  hashPassword,
  checkPassword,
  createSession,
  cookieName,
  tokenHash,
} from "@/server/auth";
import { assertOrigin, jsonBody, failure } from "@/server/http";
import { registerSchema, loginSchema } from "@/domain/validation";
import { AppError } from "@/domain/policies";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    assertOrigin(request);
    const { action } = await params;
    const db = await getDb();
    if (action === "logout") {
      const token = (await cookies()).get(cookieName)?.value;
      if (token)
        await db
          .delete(sessions)
          .where(eq(sessions.tokenHash, tokenHash(token)));
      (await cookies()).delete(cookieName);
      return NextResponse.json({ ok: true });
    }
    if (action !== "login" && action !== "register")
      throw new AppError("Ação não encontrada.", 404);
    const body = await jsonBody(request);
    const data =
      action === "register"
        ? registerSchema.parse(body)
        : loginSchema.parse(body);
    const key = createHash("sha256")
      .update(`${action}:${data.email}`)
      .digest("hex");
    const resetAt = new Date(Date.now() + 15 * 60000);
    const [attempt] = await db
      .insert(loginAttempts)
      .values({ key, count: 1, resetAt })
      .onConflictDoUpdate({
        target: loginAttempts.key,
        set: {
          count: sql`CASE WHEN ${loginAttempts.resetAt} < now() THEN 1 ELSE ${loginAttempts.count} + 1 END`,
          resetAt: sql`CASE WHEN ${loginAttempts.resetAt} < now() THEN ${resetAt.toISOString()}::timestamptz ELSE ${loginAttempts.resetAt} END`,
        },
      })
      .returning();
    if (attempt.count > 10)
      throw new AppError("Muitas tentativas. Aguarde 15 minutos.", 429);
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, data.email));
    if (action === "register") {
      if (user)
        throw new AppError(
          "Não foi possível criar a conta com este e-mail. Tente entrar.",
          409,
        );
      const parsed = registerSchema.parse(body);
      [user] = await db
        .insert(users)
        .values({
          id: randomUUID(),
          name: parsed.name,
          email: parsed.email,
          passwordHash: await hashPassword(parsed.password),
        })
        .returning();
    } else {
      const valid = await checkPassword(
        data.password,
        user?.passwordHash || `${"0".repeat(32)}:${"0".repeat(128)}`,
      );
      if (!user || !valid)
        throw new AppError("E-mail ou senha incorretos.", 401);
    }
    await db.delete(loginAttempts).where(eq(loginAttempts.key, key));
    const [member] = await db
      .select()
      .from(memberships)
      .where(
        and(eq(memberships.userId, user.id), eq(memberships.status, "ACTIVE")),
      )
      .limit(1);
    await createSession(user.id, member?.dealershipId || null);
    return NextResponse.json({ redirect: member ? "/painel" : "/boas-vindas" });
  } catch (error) {
    return failure(error);
  }
}

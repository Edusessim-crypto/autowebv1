import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "./db";
import { users, sessions, memberships, dealerships } from "./schema";
import { AppError } from "@/domain/policies";
const scrypt = promisify(scryptCallback);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}
export async function checkPassword(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  const candidate = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(key, "hex");
  return (
    expected.length === candidate.length && timingSafeEqual(expected, candidate)
  );
}
export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const cookieName = "autoweb_session";
export async function createSession(
  userId: string,
  dealershipId: string | null,
) {
  const db = await getDb();
  const token = randomBytes(32).toString("hex");
  await db.insert(sessions).values({
    tokenHash: tokenHash(token),
    userId,
    dealershipId,
    expiresAt: new Date(Date.now() + 7 * 86400000),
  });
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    secure:
      process.env.APP_ORIGIN?.startsWith("https://") ??
      process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 86400,
  });
}
export async function getSession() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const db = await getDb();
  const [row] = await db
    .select({
      session: sessions,
      user: { id: users.id, name: users.name, email: users.email },
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash(token)),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}
export async function requireUser() {
  const session = await getSession();
  if (!session) throw new AppError("Entre na sua conta para continuar.", 401);
  return session;
}
export async function requireTenant() {
  const { session, user } = await requireUser();
  if (!session.dealershipId)
    throw new AppError("Complete o cadastro da sua revenda.", 409);
  const db = await getDb();
  const [row] = await db
    .select({ membership: memberships, dealership: dealerships })
    .from(memberships)
    .innerJoin(dealerships, eq(memberships.dealershipId, dealerships.id))
    .where(
      and(
        eq(memberships.userId, user.id),
        eq(memberships.dealershipId, session.dealershipId),
        eq(memberships.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (!row) throw new AppError("Você não tem acesso a esta revenda.", 403);
  return { ...row, user };
}
export type TenantContext = Awaited<ReturnType<typeof requireTenant>>;

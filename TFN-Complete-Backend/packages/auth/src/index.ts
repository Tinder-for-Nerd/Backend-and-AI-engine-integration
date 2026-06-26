import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { Redis as RedisClient } from "ioredis";
import { SignJWT, jwtVerify } from "jose";

import type { DbClient } from "@tfn/db";
import { accounts, sessions, users } from "@tfn/db";
import type { Role } from "@tfn/shared";

export { createBetterAuth } from "./better-auth.js";

export interface AuthConfig {
  jwtSecret: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  cookieSecure: boolean;
  cookieDomain?: string | undefined;
}

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  name: string | null;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createAccessToken(user: AuthUser, config: AuthConfig) {
  const secret = new TextEncoder().encode(config.jwtSecret);
  return new SignJWT({ email: user.email, role: user.role, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${config.accessTtlSeconds}s`)
    .sign(secret);
}

export async function verifyAccessToken(token: string, config: AuthConfig): Promise<AuthUser> {
  const secret = new TextEncoder().encode(config.jwtSecret);
  const { payload } = await jwtVerify(token, secret);

  if (!payload.sub || typeof payload.email !== "string" || typeof payload.role !== "string") {
    throw new Error("Invalid token claims");
  }

  return {
    id: payload.sub,
    email: payload.email,
    role: payload.role as Role,
    name: typeof payload.name === "string" ? payload.name : null,
  };
}

export async function registerWithPassword(
  db: DbClient,
  input: { email: string; password: string; name?: string | undefined; role: Role },
) {
  const passwordHash = await hashPassword(input.password);
  const [user] = await db
    .insert(users)
    .values({
      email: input.email.toLowerCase(),
      passwordHash,
      name: input.name,
      role: input.role,
      emailVerified: false,
    })
    .returning();

  if (!user) {
    throw new Error("Could not create user");
  }

  await db.insert(accounts).values({
    userId: user.id,
    providerId: "credential",
    accountId: user.email,
    password: passwordHash,
  });

  return toAuthUser(user);
}

export async function loginWithPassword(db: DbClient, input: { email: string; password: string }) {
  const [user] = await db.select().from(users).where(eq(users.email, input.email.toLowerCase())).limit(1);

  if (!user?.passwordHash || !(await verifyPassword(input.password, user.passwordHash))) {
    return null;
  }

  return toAuthUser(user);
}

export async function createSession(db: DbClient, userId: string, token: string, expiresAt: Date, ip?: string, ua?: string) {
  await db.insert(sessions).values({
    userId,
    token,
    expiresAt,
    ipAddress: ip,
    userAgent: ua,
  });
}

export async function revokeSession(db: DbClient, token: string) {
  await db.delete(sessions).where(eq(sessions.token, token));
}

export async function recordFailedLogin(redis: RedisClient, key: string, maxAttempts = 5, lockSeconds = 15 * 60) {
  const redisKey = `auth:fail:${key.toLowerCase()}`;
  const attempts = await redis.incr(redisKey);
  await redis.expire(redisKey, lockSeconds);
  if (attempts >= maxAttempts) {
    await redis.set(`auth:lock:${key.toLowerCase()}`, "1", "EX", lockSeconds);
  }
  return attempts;
}

export async function clearFailedLogin(redis: RedisClient, key: string) {
  await redis.del(`auth:fail:${key.toLowerCase()}`, `auth:lock:${key.toLowerCase()}`);
}

export async function isLockedOut(redis: RedisClient, key: string) {
  return (await redis.exists(`auth:lock:${key.toLowerCase()}`)) === 1;
}

export function cookieOptions(config: AuthConfig) {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax" as const,
    path: "/",
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  };
}

export function requireRole(user: AuthUser | undefined, ...allowed: Role[]) {
  if (!user) {
    throw Object.assign(new Error("Authentication required"), { statusCode: 401 });
  }
  if (!allowed.includes(user.role)) {
    throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  }
}

function toAuthUser(user: typeof users.$inferSelect): AuthUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  };
}

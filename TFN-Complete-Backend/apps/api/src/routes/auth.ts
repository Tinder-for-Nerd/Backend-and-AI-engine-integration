import { randomUUID } from "node:crypto";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  clearFailedLogin,
  cookieOptions,
  createAccessToken,
  createBetterAuth,
  createSession,
  isLockedOut,
  loginWithPassword,
  recordFailedLogin,
  registerWithPassword,
  revokeSession,
  verifyAccessToken,
} from "@tfn/auth";
import { loginSchema, registerSchema } from "@tfn/shared";

import { env } from "../config/env.js";
import { automateWelcome } from "../services/automation.js";
import { parseBody } from "../utils/validation.js";

export async function authRoutes(app: FastifyInstance) {
  const betterAuth = createBetterAuth({
    baseUrl: env.API_BASE_URL,
    secret: env.BETTER_AUTH_SECRET,
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
    linkedinClientId: env.LINKEDIN_CLIENT_ID,
    linkedinClientSecret: env.LINKEDIN_CLIENT_SECRET,
  });

  app.get("/providers", async () => ({
    email_password: true,
    google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    linkedin: Boolean(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET),
    betterAuthBasePath: "/auth/better",
  }));

  app.post("/register", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = parseBody(registerSchema, request.body);
    const lockKey = `register:${body.email}`;
    if (await isLockedOut(app.redis, lockKey)) {
      return reply.code(423).send({ error: "temporarily_locked" });
    }

    try {
      const user = await registerWithPassword(app.db, body);
      await clearFailedLogin(app.redis, lockKey);
      await automateWelcome(app, user.id);
      return issueTokens(app, request, reply, user);
    } catch (error) {
      await recordFailedLogin(app.redis, lockKey);
      throw error;
    }
  });

  app.post("/login", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = parseBody(loginSchema, request.body);
    const lockKey = `login:${body.email}`;
    if (await isLockedOut(app.redis, lockKey)) {
      return reply.code(423).send({ error: "temporarily_locked" });
    }

    const user = await loginWithPassword(app.db, body);
    if (!user) {
      const attempts = await recordFailedLogin(app.redis, lockKey);
      return reply.code(401).send({
        error: "invalid_credentials",
        remainingAttempts: Math.max(5 - attempts, 0),
      });
    }

    await clearFailedLogin(app.redis, lockKey);
    return issueTokens(app, request, reply, user);
  });

  app.post("/refresh", async (request, reply) => {
    const refreshToken = request.cookies.refresh_token;
    if (!refreshToken) {
      return reply.code(401).send({ error: "refresh_token_missing" });
    }

    const user = await verifyAccessToken(refreshToken, app.authConfig);
    return issueTokens(app, request, reply, user);
  });

  app.post("/logout", async (request, reply) => {
    const refreshToken = request.cookies.refresh_token;
    if (refreshToken) {
      await revokeSession(app.db, refreshToken);
    }
    reply.clearCookie("access_token", { path: "/" });
    reply.clearCookie("refresh_token", { path: "/" });
    return { message: "logged_out" };
  });

  app.get("/me", { preHandler: app.requireAuth }, async (request) => ({ user: request.user }));

  app.all("/better/*", async (request, reply) => proxyBetterAuth(betterAuth, request, reply));
}

async function issueTokens(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  user: NonNullable<FastifyRequest["user"]>,
) {
  const accessToken = await createAccessToken(user, app.authConfig);
  const refreshToken = await createAccessToken(
    user,
    {
      ...app.authConfig,
      accessTtlSeconds: app.authConfig.refreshTtlSeconds,
    },
  );
  await createSession(
    app.db,
    user.id,
    refreshToken,
    new Date(Date.now() + app.authConfig.refreshTtlSeconds * 1000),
    request.ip,
    request.headers["user-agent"],
  );

  reply
    .setCookie("access_token", accessToken, {
      ...cookieOptions(app.authConfig),
      maxAge: app.authConfig.accessTtlSeconds,
    })
    .setCookie("refresh_token", refreshToken, {
      ...cookieOptions(app.authConfig),
      maxAge: app.authConfig.refreshTtlSeconds,
    });

  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: app.authConfig.accessTtlSeconds,
    session_id: randomUUID(),
    user,
  };
}

async function proxyBetterAuth(auth: { handler: (request: Request) => Promise<Response> }, request: FastifyRequest, reply: FastifyReply) {
  const url = new URL(request.url.replace(/^\/auth\/better/, "/auth/better"), env.API_BASE_URL);
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  const init: RequestInit = {
    method: request.method,
    headers,
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = JSON.stringify(request.body ?? {});
  }
  const response = await auth.handler(
    new Request(url, init),
  );

  reply.code(response.status);
  response.headers.forEach((value, key) => reply.header(key, value));
  return reply.send(Buffer.from(await response.arrayBuffer()));
}

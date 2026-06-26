import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import rawBody from "fastify-raw-body";
import { Redis } from "ioredis";

import { verifyAccessToken } from "@tfn/auth";
import { createDb } from "@tfn/db";
import { createQueue, createRedisConnection, queueNames } from "@tfn/queue";

import { corsOrigins, env } from "../config/env.js";

export const corePlugin = fp(async function corePlugin(app: FastifyInstance) {
  const redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  const db = createDb(env.DATABASE_URL);
  const queueConnection = createRedisConnection(env.REDIS_URL);

  redis.on("error", (error) => {
    app.log.debug({ error }, "redis_connection_error");
  });
  queueConnection.on("error", (error) => {
    app.log.debug({ error }, "queue_redis_connection_error");
  });

  try {
    await redis.connect();
    await redis.ping();
    await queueConnection.connect();
  } catch (error) {
    await redis.disconnect();
    await queueConnection.disconnect();
    throw new Error(
      `Redis is required but not reachable at ${env.REDIS_URL}. Start it with "docker compose up -d redis" or set REDIS_URL to an Upstash Redis URL.`,
      { cause: error },
    );
  }

  app.decorate("redis", redis);
  app.decorate("db", db);
  app.decorate("authConfig", {
    jwtSecret: env.JWT_SECRET,
    accessTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshTtlSeconds: env.REFRESH_TOKEN_TTL_SECONDS,
    cookieSecure: env.COOKIE_SECURE,
    cookieDomain: env.COOKIE_DOMAIN || undefined,
  });
  app.decorate("queues", {
    email: createQueue(queueNames.email, queueConnection),
    notifications: createQueue(queueNames.notifications, queueConnection),
    matchRecompute: createQueue(queueNames.matchRecompute, queueConnection),
    analytics: createQueue(queueNames.analytics, queueConnection),
    fileCleanup: createQueue(queueNames.fileCleanup, queueConnection),
    embedding: createQueue(queueNames.embedding, queueConnection),
    batchEmbedding: createQueue(queueNames.batchEmbedding, queueConnection),
    requirementAnalysis: createQueue(queueNames.requirementAnalysis, queueConnection),
    portfolioAnalysis: createQueue(queueNames.portfolioAnalysis, queueConnection),
  });
  app.decorate("requireAuth", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies.access_token ?? request.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return reply.code(401).send({ error: "authentication_required" });
    }
    try {
      request.user = await verifyAccessToken(token, app.authConfig);
    } catch {
      return reply.code(401).send({ error: "invalid_token" });
    }
  });

  await app.register(cors, {
    origin: corsOrigins,
    credentials: true,
  });
  await app.register(helmet);
  await app.register(cookie);
  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024 },
  });
  await app.register(rawBody, {
    field: "rawBody",
    global: false,
    encoding: "utf8",
    runFirst: true,
    routes: ["/billing/webhook"],
  });
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "1 minute",
    redis,
    keyGenerator: (request) => request.ip,
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "TFN Fastify API",
        version: "0.1.0",
      },
    },
  });
  await app.register(swaggerUi, {
    routePrefix: "/docs",
  });

  app.addHook("onClose", async () => {
    await redis.quit();
    await queueConnection.quit();
  });
});

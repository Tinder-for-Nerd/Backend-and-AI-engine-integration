import type { FastifyReply, FastifyRequest } from "fastify";
import type { DbClient } from "@tfn/db";
import type { AuthConfig, AuthUser } from "@tfn/auth";
import type { Queue } from "bullmq";
import type Redis from "ioredis";

declare module "fastify" {
  interface FastifyInstance {
    db: DbClient;
    redis: Redis;
    authConfig: AuthConfig;
    queues: {
      email: Queue;
      notifications: Queue;
      matchRecompute: Queue;
      analytics: Queue;
      fileCleanup: Queue;
      embedding: Queue;
      batchEmbedding: Queue;
      requirementAnalysis: Queue;
      portfolioAnalysis: Queue;
    };
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    user?: AuthUser;
    rawBody?: string | Buffer;
  }
}

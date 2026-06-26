import { Queue, Worker, type JobsOptions, type Processor } from "bullmq";
import { Redis } from "ioredis";

export const queueNames = {
  email: "email",
  notifications: "notifications",
  matchRecompute: "match-recompute",
  analytics: "analytics",
  fileCleanup: "file-cleanup",
  embedding: "embedding",
  batchEmbedding: "batch-embedding",
  requirementAnalysis: "requirement-analysis",
  portfolioAnalysis: "portfolio-analysis",
} as const;

export type QueueName = (typeof queueNames)[keyof typeof queueNames];

export interface EmailJob {
  to: string;
  subject: string;
  template:
    | "welcome"
    | "match_alert"
    | "confirmation"
    | "application_received"
    | "application_status"
    | "message_received";
  data?: Record<string, unknown>;
}

export interface NotificationJob {
  userId: string;
  type: string;
  title: string;
  body?: string;
  metadata?: Record<string, unknown>;
}

export interface MatchRecomputeJob {
  userId: string;
  projectId?: string;
}

export interface EmbeddingJob {
  ownerType: "freelancer" | "project" | "startup";
  ownerId: string;
  force?: boolean;
}

export interface BatchEmbeddingJob {
  limit?: number;
  force?: boolean;
}

export interface RequirementAnalysisJob {
  projectId: string;
  force?: boolean;
}

export interface PortfolioAnalysisJob {
  freelancerId: string;
  force?: boolean;
}

export function createRedisConnection(redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379") {
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    retryStrategy: () => null,
  });
}

export function createQueue<T>(name: QueueName, connection = createRedisConnection()) {
  return new Queue<T>(name, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
}

export function createWorker<T>(name: QueueName, processor: Processor<T>, connection = createRedisConnection()) {
  return new Worker<T>(name, processor, { connection, concurrency: 5 });
}

export async function enqueue<T>(queue: Queue<T>, name: string, data: T, opts?: JobsOptions) {
  return (queue as Queue<unknown>).add(name, data, opts);
}

import type { FastifyInstance } from "fastify";

import { env } from "../config/env.js";

interface DebounceQueue<T> {
  getJob(jobId: string): Promise<{ getState(): Promise<string>; remove(): Promise<void> } | null | undefined>;
  add(name: string, data: T, opts: DebouncedJobOptions): Promise<unknown>;
}

interface DebouncedJobOptions {
  jobId: string;
  delay?: number;
}

export async function enqueueFreelancerAiRefresh(app: FastifyInstance, freelancerId: string, force = false) {
  await addDebouncedJob(
    app.queues.portfolioAnalysis,
    "portfolio_analysis",
    { freelancerId, force },
    { jobId: `portfolio-${freelancerId}`, delay: env.EMBEDDING_DEBOUNCE_MS },
  );
  await addDebouncedJob(
    app.queues.embedding,
    "profile_embedding",
    { ownerType: "freelancer", ownerId: freelancerId, force },
    { jobId: `embedding-profile-${freelancerId}`, delay: env.EMBEDDING_DEBOUNCE_MS },
  );
}

export async function enqueueProjectAiRefresh(app: FastifyInstance, projectId: string, force = false) {
  await addDebouncedJob(
    app.queues.requirementAnalysis,
    "requirement_analysis",
    { projectId, force },
    { jobId: `requirements-${projectId}`, delay: env.EMBEDDING_DEBOUNCE_MS },
  );
}

export async function enqueueStartupAiRefresh(app: FastifyInstance, startupId: string, force = false) {
  await addDebouncedJob(
    app.queues.embedding,
    "startup_embedding",
    { ownerType: "startup", ownerId: startupId, force },
    { jobId: `embedding-startup-${startupId}`, delay: env.EMBEDDING_DEBOUNCE_MS },
  );
}

export async function enqueueBatchFreelancerEmbedding(app: FastifyInstance, limit = 100, force = false) {
  await app.queues.batchEmbedding.add("batch_freelancer_embedding", { limit, force }, { jobId: `batch-freelancers-${Date.now()}` });
}

async function addDebouncedJob<T>(queue: DebounceQueue<T>, name: string, data: T, opts: DebouncedJobOptions) {
  const existing = await queue.getJob(opts.jobId);
  if (existing) {
    const state = await existing.getState();
    if (["delayed", "waiting", "waiting-children", "prioritized"].includes(state)) {
      await existing.remove();
    }
  }

  return queue.add(name, data, opts);
}

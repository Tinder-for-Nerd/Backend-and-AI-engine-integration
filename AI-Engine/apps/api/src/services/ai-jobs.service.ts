import type { FastifyInstance } from "fastify";

import { env } from "../config/env.js";

export async function enqueueFreelancerAiRefresh(app: FastifyInstance, freelancerId: string, force = false) {
  await app.queues.portfolioAnalysis.add(
    "portfolio_analysis",
    { freelancerId, force },
    { jobId: `portfolio:${freelancerId}`, delay: env.EMBEDDING_DEBOUNCE_MS },
  );
  await app.queues.embedding.add(
    "profile_embedding",
    { ownerType: "freelancer", ownerId: freelancerId, force },
    { jobId: `embedding:profile:${freelancerId}`, delay: env.EMBEDDING_DEBOUNCE_MS },
  );
}

export async function enqueueProjectAiRefresh(app: FastifyInstance, projectId: string, force = false) {
  await app.queues.requirementAnalysis.add(
    "requirement_analysis",
    { projectId, force },
    { jobId: `requirements:${projectId}`, delay: env.EMBEDDING_DEBOUNCE_MS },
  );
}

export async function enqueueBatchFreelancerEmbedding(app: FastifyInstance, limit = 100, force = false) {
  await app.queues.batchEmbedding.add("batch_freelancer_embedding", { limit, force }, { jobId: `batch:freelancers:${Date.now()}` });
}

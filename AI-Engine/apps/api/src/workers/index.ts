import "dotenv/config";

import { lt } from "drizzle-orm";

import { db, analyticsEvents, fileAssets, notifications } from "@tfn/db";
import { buildEmailTemplate, createResend, sendEmail } from "@tfn/integrations";
import {
  createQueue,
  createRedisConnection,
  createWorker,
  queueNames,
  type BatchEmbeddingJob,
  type EmailJob,
  type EmbeddingJob,
  type MatchRecomputeJob,
  type NotificationJob,
  type PortfolioAnalysisJob,
  type RequirementAnalysisJob,
} from "@tfn/queue";

import { env } from "../config/env.js";
import {
  analyzeAndPersistPortfolio,
  analyzeAndPersistProjectRequirements,
  listFreelancersForBatchEmbedding,
  upsertFreelancerEmbedding,
  upsertProjectEmbedding,
} from "../services/ai-indexing.service.js";

const connection = createRedisConnection(env.REDIS_URL);
const resend = createResend(env.RESEND_API_KEY);

connection.on("error", (error) => {
  console.debug("redis_connection_error", error);
});

try {
  await connection.connect();
  await connection.ping();
} catch (error) {
  await connection.disconnect();
  console.error(
    `Redis is required but not reachable at ${env.REDIS_URL}. Start it with "docker compose up -d redis" or set REDIS_URL to an Upstash Redis URL.`,
  );
  console.error(error);
  process.exit(1);
}

const embeddingQueue = createQueue<EmbeddingJob>(queueNames.embedding, connection);

createWorker<EmailJob>(
  queueNames.email,
  async (job) => {
    await sendEmail(resend, {
      from: env.RESEND_FROM_EMAIL,
      to: job.data.to,
      subject: job.data.subject,
      html: buildEmailTemplate(job.data.template, job.data.data),
    });
  },
  connection,
);

createWorker<NotificationJob>(
  queueNames.notifications,
  async (job) => {
    await db.insert(notifications).values({
      userId: job.data.userId,
      type: job.data.type as "welcome",
      title: job.data.title,
      body: job.data.body,
      metadata: job.data.metadata ?? {},
    });
  },
  connection,
);

createWorker<MatchRecomputeJob>(
  queueNames.matchRecompute,
  async (job) => {
    await connection.publish("matches:recompute", JSON.stringify(job.data));
  },
  connection,
);

createWorker<Record<string, unknown>>(
  queueNames.analytics,
  async (job) => {
    await db.insert(analyticsEvents).values({
      actorId: typeof job.data.actorId === "string" ? job.data.actorId : undefined,
      subjectUserId: typeof job.data.subjectUserId === "string" ? job.data.subjectUserId : undefined,
      projectId: typeof job.data.projectId === "string" ? job.data.projectId : undefined,
      type: typeof job.data.type === "string" ? job.data.type : job.name,
      metadata: job.data,
    });
  },
  connection,
);

createWorker<Record<string, unknown>>(
  queueNames.fileCleanup,
  async () => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db.delete(fileAssets).where(lt(fileAssets.createdAt, cutoff));
  },
  connection,
);

createWorker<EmbeddingJob>(
  queueNames.embedding,
  async (job) => {
    if (job.data.ownerType === "freelancer") {
      await upsertFreelancerEmbedding(db, job.data.ownerId, job.data.force);
      return;
    }
    await upsertProjectEmbedding(db, job.data.ownerId, job.data.force);
  },
  connection,
);

createWorker<BatchEmbeddingJob>(
  queueNames.batchEmbedding,
  async (job) => {
    const freelancers = await listFreelancersForBatchEmbedding(db, job.data.limit ?? 100);
    await Promise.all(
      freelancers.map((freelancer) =>
        embeddingQueue.add(
          "profile_embedding",
          { ownerType: "freelancer", ownerId: freelancer.id, force: job.data.force ?? false },
          { jobId: `embedding:profile:${freelancer.id}` },
        ),
      ),
    );
  },
  connection,
);

createWorker<RequirementAnalysisJob>(
  queueNames.requirementAnalysis,
  async (job) => {
    await analyzeAndPersistProjectRequirements(db, job.data.projectId, job.data.force);
    await embeddingQueue.add(
      "project_embedding",
      { ownerType: "project", ownerId: job.data.projectId, force: job.data.force ?? false },
      { jobId: `embedding:project:${job.data.projectId}` },
    );
  },
  connection,
);

createWorker<PortfolioAnalysisJob>(
  queueNames.portfolioAnalysis,
  async (job) => {
    await analyzeAndPersistPortfolio(db, job.data.freelancerId, job.data.force);
    await embeddingQueue.add(
      "profile_embedding",
      { ownerType: "freelancer", ownerId: job.data.freelancerId, force: job.data.force ?? false },
      { jobId: `embedding:profile:${job.data.freelancerId}` },
    );
  },
  connection,
);

console.log("TFN workers running.");

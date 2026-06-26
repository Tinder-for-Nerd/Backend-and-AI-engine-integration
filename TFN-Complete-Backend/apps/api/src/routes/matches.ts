import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { requireRole } from "@tfn/auth";
import { matchSignals, projects, startups } from "@tfn/db";
import { matchSignalSchema } from "@tfn/shared";

import { env } from "../config/env.js";
import { enqueueBatchFreelancerEmbedding } from "../services/ai-jobs.service.js";
import { findHybridFreelancerCandidatesForProject } from "../services/hybrid-search.service.js";
import { getMatchExplanation } from "../services/match-explanations.service.js";
import { rerankWithSignals } from "../services/reranker.service.js";
import { parseBody, parseQuery } from "../utils/validation.js";

export async function matchesRoutes(app: FastifyInstance) {
  app.get("/feed", { preHandler: app.requireAuth }, async (request) => {
    const query = parseQuery(
      z.object({
        projectId: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
        explain: z.coerce.boolean().default(false),
      }),
      request.query,
    );

    const cacheKey = `match-feed:${request.user!.id}:${query.projectId ?? "auto"}:${query.limit}:${query.explain}`;
    const cached = await app.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as unknown;
    }

    const project = query.projectId
      ? (await app.db.select().from(projects).where(eq(projects.id, query.projectId)).limit(1))[0]
      : await findLatestProjectForStartup(app, request.user!.id);

    if (!project) {
      return { project: null, items: [] };
    }

    const candidates = await findHybridFreelancerCandidatesForProject({
      db: app.db,
      project,
      limit: Math.max(query.limit * 3, 30),
    });
    const signals = await app.db.select().from(matchSignals).where(eq(matchSignals.userId, request.user!.id)).limit(500);
    const items = rerankWithSignals(
      candidates.map((candidate) => ({
        freelancerId: candidate.freelancer.id,
        score: candidate.fit.score,
        item: candidate,
      })),
      signals,
    ).slice(0, query.limit);

    const itemsWithExplanations = query.explain
      ? await Promise.all(
          items.map(async (item) => ({
            ...item,
            explanation: await getMatchExplanation({
              db: app.db,
              redis: app.redis,
              project,
              freelancer: item.freelancer,
              fit: { ...item.fit, rerank: item.rerank },
            }),
          })),
        )
      : items;

    const payload = { project, items: itemsWithExplanations };
    await app.redis.set(cacheKey, JSON.stringify(payload), "EX", env.MATCH_FEED_CACHE_TTL_SECONDS);
    return payload;
  });

  app.post("/signals", { preHandler: app.requireAuth }, async (request, reply) => {
    const body = parseBody(matchSignalSchema, request.body);
    const [signal] = await app.db
      .insert(matchSignals)
      .values({
        userId: request.user!.id,
        projectId: body.projectId,
        freelancerId: body.freelancerId,
        signal: body.signal,
        weight: body.weight,
      })
      .returning();
    await app.queues.matchRecompute.add("signal_recorded", { userId: request.user!.id, projectId: body.projectId });
    return reply.code(201).send(signal);
  });

  app.post("/admin/reindex-freelancers", { preHandler: app.requireAuth }, async (request, reply) => {
    requireRole(request.user, "admin");
    const body = parseBody(
      z.object({
        limit: z.number().int().min(1).max(1000).default(100),
        force: z.boolean().default(false),
      }),
      request.body,
    );
    await enqueueBatchFreelancerEmbedding(app, body.limit, body.force);
    return reply.code(202).send({ ok: true });
  });
}

async function findLatestProjectForStartup(app: FastifyInstance, userId: string) {
  const [startup] = await app.db.select().from(startups).where(eq(startups.userId, userId)).limit(1);
  if (!startup) return null;
  const [project] = await app.db
    .select()
    .from(projects)
    .where(eq(projects.startupId, startup.id))
    .orderBy(desc(projects.createdAt))
    .limit(1);
  return project ?? null;
}

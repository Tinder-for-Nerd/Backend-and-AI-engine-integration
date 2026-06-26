import { and, desc, eq, ilike, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { requireRole } from "@tfn/auth";
import { projects, startups } from "@tfn/db";
import { idParamSchema, paginationQuerySchema, projectSchema } from "@tfn/shared";

import { enqueueProjectAiRefresh } from "../services/ai-jobs.service.js";
import { removeProjectEmbedding } from "../services/ai-indexing.service.js";
import { parseBody, parseParams, parseQuery } from "../utils/validation.js";

export async function projectsRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const query = parseQuery(
      paginationQuerySchema.extend({
        q: z.string().optional(),
        status: z.enum(["draft", "open", "paused", "filled", "closed"]).optional(),
      }),
      request.query,
    );

    const search = query.q ? or(ilike(projects.title, `%${query.q}%`), ilike(projects.description, `%${query.q}%`)) : undefined;
    const status = query.status ? eq(projects.status, query.status) : eq(projects.status, "open");
    const where = search ? and(search, status) : status;

    return app.db.select().from(projects).where(where).orderBy(desc(projects.createdAt)).limit(query.limit);
  });

  app.post("/", { preHandler: app.requireAuth }, async (request, reply) => {
    requireRole(request.user, "startup", "admin");
    const body = parseBody(projectSchema, request.body);
    const startup = await getStartupForUser(app, request.user!.id);
    if (!startup) {
      return reply.code(400).send({ error: "startup_profile_required" });
    }

    const [project] = await app.db.insert(projects).values({ startupId: startup.id, ...body }).returning();
    await enqueueProjectAiRefresh(app, project!.id);
    await app.queues.matchRecompute.add("project_created", { projectId: project!.id, userId: request.user!.id });
    return reply.code(201).send(project);
  });

  app.get("/:id", async (request, reply) => {
    const { id } = parseParams(idParamSchema, request.params);
    const [project] = await app.db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project) {
      return reply.code(404).send({ error: "project_not_found" });
    }
    await app.db.update(projects).set({ viewCount: project.viewCount + 1 }).where(eq(projects.id, id));
    return project;
  });

  app.patch("/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    requireRole(request.user, "startup", "admin");
    const { id } = parseParams(idParamSchema, request.params);
    const body = parseBody(projectSchema.partial(), request.body);
    const startup = await getStartupForUser(app, request.user!.id);
    const [project] = await app.db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project) {
      return reply.code(404).send({ error: "project_not_found" });
    }
    if (request.user!.role !== "admin" && project.startupId !== startup?.id) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const [updated] = await app.db.update(projects).set({ ...body, updatedAt: new Date() }).where(eq(projects.id, id)).returning();
    await enqueueProjectAiRefresh(app, id, true);
    return updated;
  });

  app.delete("/:id", { preHandler: app.requireAuth }, async (request, reply) => {
    requireRole(request.user, "startup", "admin");
    const { id } = parseParams(idParamSchema, request.params);
    const startup = await getStartupForUser(app, request.user!.id);
    const [project] = await app.db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project) {
      return reply.code(404).send({ error: "project_not_found" });
    }
    if (request.user!.role !== "admin" && project.startupId !== startup?.id) {
      return reply.code(403).send({ error: "forbidden" });
    }
    await removeProjectEmbedding(app.db, id);
    await app.db.delete(projects).where(eq(projects.id, id));
    return { ok: true };
  });
}

async function getStartupForUser(app: FastifyInstance, userId: string) {
  const [startup] = await app.db.select().from(startups).where(eq(startups.userId, userId)).limit(1);
  return startup;
}

import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { requireRole } from "@tfn/auth";
import { applications, conversations, freelancers, projects, startups, users } from "@tfn/db";
import { applicationCreateSchema, idParamSchema } from "@tfn/shared";

import { automateApplicationReceived, automateApplicationStatus } from "../services/automation.js";
import { parseBody, parseParams } from "../utils/validation.js";

export async function applicationsRoutes(app: FastifyInstance) {
  app.post("/", { preHandler: app.requireAuth }, async (request, reply) => {
    requireRole(request.user, "freelancer", "admin");
    const body = parseBody(applicationCreateSchema, request.body);
    const [freelancer] = await app.db.select().from(freelancers).where(eq(freelancers.userId, request.user!.id)).limit(1);
    if (!freelancer) {
      return reply.code(400).send({ error: "freelancer_profile_required" });
    }

    const [project] = await app.db.select().from(projects).where(eq(projects.id, body.projectId)).limit(1);
    if (!project) {
      return reply.code(404).send({ error: "project_not_found" });
    }

    const [startup] = await app.db.select().from(startups).where(eq(startups.id, project.startupId)).limit(1);
    if (!startup) {
      return reply.code(404).send({ error: "startup_not_found" });
    }

    const [conversation] = await app.db
      .insert(conversations)
      .values({
        projectId: project.id,
        startupUserId: startup.userId,
        freelancerUserId: request.user!.id,
      })
      .onConflictDoUpdate({
        target: [conversations.projectId, conversations.startupUserId, conversations.freelancerUserId],
        set: { updatedAt: new Date() },
      })
      .returning();

    const [application] = await app.db
      .insert(applications)
      .values({
        projectId: body.projectId,
        freelancerId: freelancer.id,
        conversationId: conversation!.id,
        coverLetter: body.coverLetter,
        proposedRateCents: body.proposedRateCents,
      })
      .returning();

    const [freelancerUser] = await app.db.select().from(users).where(eq(users.id, request.user!.id)).limit(1);
    await automateApplicationReceived(app, {
      startupUserId: startup.userId,
      applicationId: application!.id,
      projectId: project.id,
      projectTitle: project.title,
      freelancerName: freelancerUser?.name ?? freelancerUser?.email ?? null,
    });

    return reply.code(201).send(application);
  });

  app.get("/", { preHandler: app.requireAuth }, async (request) => {
    if (request.user!.role === "freelancer") {
      const [freelancer] = await app.db.select().from(freelancers).where(eq(freelancers.userId, request.user!.id)).limit(1);
      return freelancer ? app.db.select().from(applications).where(eq(applications.freelancerId, freelancer.id)) : [];
    }

    if (request.user!.role === "startup") {
      const [startup] = await app.db.select().from(startups).where(eq(startups.userId, request.user!.id)).limit(1);
      if (!startup) return [];
      const startupProjects = await app.db.select({ id: projects.id }).from(projects).where(eq(projects.startupId, startup.id));
      const projectIds = new Set(startupProjects.map((project) => project.id));
      const allApplications = await app.db.select().from(applications);
      return allApplications.filter((application) => projectIds.has(application.projectId));
    }

    return app.db.select().from(applications);
  });

  app.patch("/:id/status", { preHandler: app.requireAuth }, async (request, reply) => {
    requireRole(request.user, "startup", "admin");
    const { id } = parseParams(idParamSchema, request.params);
    const body = parseBody(
      z.object({
        status: z.enum(["shortlisted", "accepted", "declined", "withdrawn"]),
      }),
      request.body,
    );

    const [application] = await app.db.select().from(applications).where(eq(applications.id, id)).limit(1);
    if (!application) {
      return reply.code(404).send({ error: "application_not_found" });
    }
    const [project] = await app.db.select().from(projects).where(eq(projects.id, application.projectId)).limit(1);
    const [startup] = project
      ? await app.db.select().from(startups).where(eq(startups.id, project.startupId)).limit(1)
      : [undefined];
    if (request.user!.role !== "admin" && startup?.userId !== request.user!.id) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const [updated] = await app.db
      .update(applications)
      .set({ status: body.status, updatedAt: new Date() })
      .where(and(eq(applications.id, id), eq(applications.projectId, application.projectId)))
      .returning();

    if (body.status === "accepted" && project) {
      await app.db.update(projects).set({ status: "filled", filledByFreelancerId: application.freelancerId }).where(eq(projects.id, project.id));
    }

    const [freelancer] = await app.db.select().from(freelancers).where(eq(freelancers.id, application.freelancerId)).limit(1);
    if (freelancer) {
      await automateApplicationStatus(app, {
        freelancerUserId: freelancer.userId,
        applicationId: id,
        projectId: application.projectId,
        projectTitle: project?.title ?? "the project",
        status: body.status,
      });
    }

    return updated;
  });
}

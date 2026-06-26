import { eq, ilike, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { freelancers, portfolioItems } from "@tfn/db";
import { freelancerProfileSchema, idParamSchema, paginationQuerySchema } from "@tfn/shared";

import { enqueueFreelancerAiRefresh } from "../services/ai-jobs.service.js";
import { parseBody, parseParams, parseQuery } from "../utils/validation.js";

export async function freelancersRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const query = parseQuery(
      paginationQuerySchema.extend({
        skill: z.string().optional(),
        q: z.string().optional(),
      }),
      request.query,
    );

    const where = query.q
      ? or(ilike(freelancers.title, `%${query.q}%`), ilike(freelancers.bio, `%${query.q}%`))
      : undefined;

    return app.db.select().from(freelancers).where(where).limit(query.limit);
  });

  app.get("/me", { preHandler: app.requireAuth }, async (request, reply) => {
    const [profile] = await app.db.select().from(freelancers).where(eq(freelancers.userId, request.user!.id)).limit(1);
    if (!profile) {
      return reply.code(404).send({ error: "freelancer_profile_not_found" });
    }
    return profile;
  });

  app.put("/me", { preHandler: app.requireAuth }, async (request) => {
    const body = parseBody(freelancerProfileSchema, request.body);
    const [profile] = await app.db
      .insert(freelancers)
      .values({
        userId: request.user!.id,
        title: body.title,
        bio: body.bio,
        location: body.location,
        hourlyRateCents: body.hourlyRateCents,
        projectRateCents: body.projectRateCents,
        availability: body.availability,
        skills: body.skills ?? [],
      })
      .onConflictDoUpdate({
        target: freelancers.userId,
        set: {
          title: body.title,
          bio: body.bio,
          location: body.location,
          hourlyRateCents: body.hourlyRateCents,
          projectRateCents: body.projectRateCents,
          availability: body.availability,
          skills: body.skills ?? [],
          updatedAt: new Date(),
        },
      })
      .returning();
    await enqueueFreelancerAiRefresh(app, profile!.id);
    return profile;
  });

  app.get("/:id", async (request, reply) => {
    const { id } = parseParams(idParamSchema, request.params);
    const [profile] = await app.db.select().from(freelancers).where(eq(freelancers.id, id)).limit(1);
    if (!profile) {
      return reply.code(404).send({ error: "freelancer_not_found" });
    }
    await app.db
      .update(freelancers)
      .set({ profileViews: profile.profileViews + 1 })
      .where(eq(freelancers.id, id));
    await app.queues.analytics.add("profile_view", {
      subjectUserId: profile.userId,
      type: "profile_view",
      actorId: request.user?.id,
    });
    return profile;
  });

  app.post("/portfolio", { preHandler: app.requireAuth }, async (request, reply) => {
    const body = parseBody(
      z.object({
        title: z.string().min(1).max(180),
        description: z.string().max(3000).optional(),
        url: z.string().url().optional(),
        assetId: z.string().uuid().optional(),
      }),
      request.body,
    );
    const [profile] = await app.db.select().from(freelancers).where(eq(freelancers.userId, request.user!.id)).limit(1);
    if (!profile) {
      return reply.code(404).send({ error: "freelancer_profile_required" });
    }
    const [item] = await app.db.insert(portfolioItems).values({ freelancerId: profile.id, ...body }).returning();
    await enqueueFreelancerAiRefresh(app, profile.id);
    return reply.code(201).send(item);
  });
}

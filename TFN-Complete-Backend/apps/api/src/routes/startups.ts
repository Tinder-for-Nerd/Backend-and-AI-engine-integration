import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import { startups } from "@tfn/db";
import { requireRole } from "@tfn/auth";
import { idParamSchema, startupProfileSchema } from "@tfn/shared";

import { parseBody, parseParams } from "../utils/validation.js";

export async function startupsRoutes(app: FastifyInstance) {
  app.get("/me", { preHandler: app.requireAuth }, async (request, reply) => {
    requireRole(request.user, "startup", "admin");
    const [profile] = await app.db.select().from(startups).where(eq(startups.userId, request.user!.id)).limit(1);
    if (!profile) {
      return reply.code(404).send({ error: "startup_profile_not_found" });
    }
    return profile;
  });

  app.put("/me", { preHandler: app.requireAuth }, async (request) => {
    requireRole(request.user, "startup", "admin");
    const body = parseBody(startupProfileSchema, request.body);
    const [profile] = await app.db
      .insert(startups)
      .values({
        userId: request.user!.id,
        companyName: body.companyName,
        website: body.website,
        industry: body.industry,
        companySize: body.companySize,
        description: body.description,
      })
      .onConflictDoUpdate({
        target: startups.userId,
        set: {
          companyName: body.companyName,
          website: body.website,
          industry: body.industry,
          companySize: body.companySize,
          description: body.description,
          updatedAt: new Date(),
        },
      })
      .returning();
    return profile;
  });

  app.get("/:id", async (request, reply) => {
    const { id } = parseParams(idParamSchema, request.params);
    const [profile] = await app.db.select().from(startups).where(eq(startups.id, id)).limit(1);
    if (!profile) {
      return reply.code(404).send({ error: "startup_not_found" });
    }
    return profile;
  });
}

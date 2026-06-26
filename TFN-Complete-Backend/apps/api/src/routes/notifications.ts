import { and, desc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import { notifications } from "@tfn/db";
import { idParamSchema, paginationQuerySchema } from "@tfn/shared";

import { parseParams, parseQuery } from "../utils/validation.js";

export async function notificationsRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.requireAuth }, async (request) => {
    const query = parseQuery(paginationQuerySchema, request.query);
    return app.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, request.user!.id))
      .orderBy(desc(notifications.createdAt))
      .limit(query.limit);
  });

  app.get("/unread", { preHandler: app.requireAuth }, async (request) => {
    return app.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, request.user!.id), isNull(notifications.readAt)))
      .orderBy(desc(notifications.createdAt));
  });

  app.post("/:id/read", { preHandler: app.requireAuth }, async (request, reply) => {
    const { id } = parseParams(idParamSchema, request.params);
    const [updated] = await app.db
      .update(notifications)
      .set({ readAt: new Date(), updatedAt: new Date() })
      .where(eq(notifications.id, id))
      .returning();
    if (!updated) {
      return reply.code(404).send({ error: "notification_not_found" });
    }
    return updated;
  });
}

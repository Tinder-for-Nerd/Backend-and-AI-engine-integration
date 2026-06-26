import { and, count, eq, gte, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { analyticsEvents, applications, matchSignals, messages } from "@tfn/db";

import { parseQuery } from "../utils/validation.js";

export async function analyticsRoutes(app: FastifyInstance) {
  app.get("/summary", { preHandler: app.requireAuth }, async (request) => {
    const query = parseQuery(
      z.object({
        days: z.coerce.number().int().min(1).max(365).default(30),
      }),
      request.query,
    );
    const since = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000);

    const [profileViews] = await app.db
      .select({ value: count() })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.subjectUserId, request.user!.id),
          eq(analyticsEvents.type, "profile_view"),
          gte(analyticsEvents.createdAt, since),
        ),
      );

    const [matchQuality] = await app.db
      .select({ value: sql<number>`coalesce(avg(${matchSignals.weight}), 0)` })
      .from(matchSignals)
      .where(and(eq(matchSignals.userId, request.user!.id), gte(matchSignals.createdAt, since)));

    const [applicationCount] = await app.db
      .select({ value: count() })
      .from(applications)
      .where(gte(applications.createdAt, since));

    const [sentMessages] = await app.db
      .select({ value: count() })
      .from(messages)
      .where(and(eq(messages.senderId, request.user!.id), gte(messages.createdAt, since)));

    return {
      windowDays: query.days,
      profileViews: profileViews?.value ?? 0,
      matchQuality: Number(matchQuality?.value ?? 0),
      applications: applicationCount?.value ?? 0,
      responseRates: {
        sentMessages: sentMessages?.value ?? 0,
      },
    };
  });
}

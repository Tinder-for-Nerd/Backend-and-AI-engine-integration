import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ status: "ok", service: "tfn-fastify-api" }));

  app.get("/ready", async () => {
    const dbStart = Date.now();
    await app.db.execute(sql`select 1`);
    const redisStart = Date.now();
    await app.redis.ping();

    return {
      status: "ready",
      checks: {
        database: { status: "ok", latencyMs: Date.now() - dbStart },
        redis: { status: "ok", latencyMs: Date.now() - redisStart },
      },
    };
  });
}

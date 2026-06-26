import Fastify from "fastify";

import { corePlugin } from "./plugins/core.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { applicationsRoutes } from "./routes/applications.js";
import { authRoutes } from "./routes/auth.js";
import { billingRoutes } from "./routes/billing.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { filesRoutes } from "./routes/files.js";
import { freelancersRoutes } from "./routes/freelancers.js";
import { healthRoutes } from "./routes/health.js";
import { matchesRoutes } from "./routes/matches.js";
import { messagesRoutes } from "./routes/messages.js";
import { notificationsRoutes } from "./routes/notifications.js";
import { projectsRoutes } from "./routes/projects.js";
import { searchRoutes } from "./routes/search.js";
import { startupsRoutes } from "./routes/startups.js";

export async function buildApp() {
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  await app.register(corePlugin);
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(freelancersRoutes, { prefix: "/freelancers" });
  await app.register(startupsRoutes, { prefix: "/startups" });
  await app.register(projectsRoutes, { prefix: "/projects" });
  await app.register(matchesRoutes, { prefix: "/matches" });
  await app.register(applicationsRoutes, { prefix: "/applications" });
  await app.register(messagesRoutes, { prefix: "/messages" });
  await app.register(notificationsRoutes, { prefix: "/notifications" });
  await app.register(analyticsRoutes, { prefix: "/analytics" });
  await app.register(dashboardRoutes, { prefix: "/dashboard" });
  await app.register(searchRoutes, { prefix: "/search" });
  await app.register(filesRoutes, { prefix: "/files" });
  await app.register(billingRoutes, { prefix: "/billing" });

  app.setErrorHandler((error, _request, reply) => {
    const err = error instanceof Error ? error : new Error("Unknown error");
    const maybeStatus = (error as { statusCode?: unknown }).statusCode;
    const statusCode = typeof maybeStatus === "number" ? maybeStatus : 500;
    reply.code(statusCode).send({
      error: statusCode >= 500 ? "internal_server_error" : "request_error",
      message: err.message,
    });
  });

  return app;
}

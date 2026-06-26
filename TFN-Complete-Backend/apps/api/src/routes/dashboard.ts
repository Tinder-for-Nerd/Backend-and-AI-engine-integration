import { desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import { requireRole } from "@tfn/auth";
import { applications, freelancers, projects, startups } from "@tfn/db";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/hiring", { preHandler: app.requireAuth }, async (request, reply) => {
    requireRole(request.user, "startup", "admin");

    const startup =
      request.user!.role === "admin"
        ? null
        : (await app.db.select().from(startups).where(eq(startups.userId, request.user!.id)).limit(1))[0];

    if (request.user!.role !== "admin" && !startup) {
      return reply.code(404).send({ error: "startup_profile_required" });
    }

    const ownedProjects =
      request.user!.role === "admin"
        ? await app.db.select().from(projects).orderBy(desc(projects.createdAt)).limit(100)
        : await app.db.select().from(projects).where(eq(projects.startupId, startup!.id)).orderBy(desc(projects.createdAt));

    const projectIds = ownedProjects.map((project) => project.id);
    const projectApplications = projectIds.length
      ? await app.db.select().from(applications).where(inArray(applications.projectId, projectIds))
      : [];
    const freelancerIds = [...new Set(projectApplications.map((application) => application.freelancerId))];
    const applicantProfiles = freelancerIds.length
      ? await app.db.select().from(freelancers).where(inArray(freelancers.id, freelancerIds))
      : [];

    const projectsById = new Map(ownedProjects.map((project) => [project.id, project]));
    const freelancersById = new Map(applicantProfiles.map((freelancer) => [freelancer.id, freelancer]));
    const applicationsByStatus = countBy(projectApplications, (application) => application.status);
    const projectsByStatus = countBy(ownedProjects, (project) => project.status);

    const recentApplications = [...projectApplications]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, 20)
      .map((application) => ({
        ...application,
        project: projectsById.get(application.projectId) ?? null,
        freelancer: freelancersById.get(application.freelancerId) ?? null,
      }));

    return {
      startup,
      totals: {
        projects: ownedProjects.length,
        applications: projectApplications.length,
        openProjects: projectsByStatus.open ?? 0,
        shortlisted: applicationsByStatus.shortlisted ?? 0,
        accepted: applicationsByStatus.accepted ?? 0,
        declined: applicationsByStatus.declined ?? 0,
      },
      projectsByStatus,
      applicationsByStatus,
      recentApplications,
    };
  });
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, number>>((acc, item) => {
    const key = getKey(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

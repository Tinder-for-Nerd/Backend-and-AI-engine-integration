import { eq } from "drizzle-orm";

import { projectRequirementAnalyses, projects, type DbClient } from "@tfn/db";

import { createEmbedding } from "./qwen.service.js";
import { buildProjectRequirementBlob, createSourceHash } from "./text-blobs.service.js";
import { queryProfilesByEmbedding, type VectorSearchResult } from "./vector-store.service.js";

export async function searchFreelancersForProject(input: {
  db: DbClient;
  projectId: string;
  limit: number;
}): Promise<{
  project: typeof projects.$inferSelect | null;
  sourceHash?: string;
  results: VectorSearchResult[];
}> {
  const [project] = await input.db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
  if (!project) {
    return { project: null, results: [] };
  }

  const [analysis] = await input.db
    .select()
    .from(projectRequirementAnalyses)
    .where(eq(projectRequirementAnalyses.projectId, project.id))
    .limit(1);
  const document = buildProjectRequirementBlob({ project, requirementAnalysis: analysis });
  const sourceHash = createSourceHash(document);
  const embedding = await createEmbedding(document);
  const results = await queryProfilesByEmbedding(embedding, input.limit);

  return { project, sourceHash, results };
}

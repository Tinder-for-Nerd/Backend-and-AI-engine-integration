import { and, eq } from "drizzle-orm";

import {
  aiEmbeddingRecords,
  freelancers,
  portfolioItems,
  portfolioQualityScores,
  projectRequirementAnalyses,
  projects,
  type DbClient,
} from "@tfn/db";

import { env } from "../config/env.js";
import { createEmbedding } from "./qwen.service.js";
import {
  buildFreelancerProfileBlob,
  buildPortfolioAnalysisBlob,
  buildProjectRequirementBlob,
  createSourceHash,
} from "./text-blobs.service.js";
import {
  deleteProfileVector,
  deleteProjectVector,
  upsertProfileVector,
  upsertProjectVector,
} from "./vector-store.service.js";
import { analyzeRequirementText } from "./nlp-extraction.service.js";
import { analyzePortfolioBlob } from "./portfolio-analyzer.service.js";

export async function analyzeAndPersistProjectRequirements(db: DbClient, projectId: string, force = false) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;

  const result = await analyzeRequirementText({
    title: project.title,
    description: project.description,
    requiredSkills: project.requiredSkills,
  });

  const [existing] = await db
    .select()
    .from(projectRequirementAnalyses)
    .where(eq(projectRequirementAnalyses.projectId, projectId))
    .limit(1);

  if (!force && existing?.sourceHash === result.sourceHash) {
    return existing;
  }

  const extractedSkills = normalizeSkills([...project.requiredSkills, ...(result.skills ?? [])]);

  const [analysis] = await db
    .insert(projectRequirementAnalyses)
    .values({
      projectId,
      sourceHash: result.sourceHash,
      extractedSkills,
      budgetMinCents: result.budgetMinCents ?? project.budgetMinCents,
      budgetMaxCents: result.budgetMaxCents ?? project.budgetMaxCents,
      durationWeeks: result.durationWeeks,
      seniority: result.seniority,
      domain: result.domain,
      summary: result.summary,
      raw: result.raw,
      analyzedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: projectRequirementAnalyses.projectId,
      set: {
        sourceHash: result.sourceHash,
        extractedSkills,
        budgetMinCents: result.budgetMinCents ?? project.budgetMinCents,
        budgetMaxCents: result.budgetMaxCents ?? project.budgetMaxCents,
        durationWeeks: result.durationWeeks,
        seniority: result.seniority,
        domain: result.domain,
        summary: result.summary,
        raw: result.raw,
        analyzedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();

  if (extractedSkills.length && !sameSkills(project.requiredSkills, extractedSkills)) {
    await db.update(projects).set({ requiredSkills: extractedSkills, updatedAt: new Date() }).where(eq(projects.id, projectId));
  }

  return analysis;
}

export async function analyzeAndPersistPortfolio(db: DbClient, freelancerId: string, force = false) {
  const [freelancer] = await db.select().from(freelancers).where(eq(freelancers.id, freelancerId)).limit(1);
  if (!freelancer) return null;

  const items = await db.select().from(portfolioItems).where(eq(portfolioItems.freelancerId, freelancerId));
  const blob = buildPortfolioAnalysisBlob({ freelancer, portfolioItems: items });
  const sourceHash = createSourceHash(blob);
  const [existing] = await db
    .select()
    .from(portfolioQualityScores)
    .where(eq(portfolioQualityScores.freelancerId, freelancerId))
    .limit(1);

  if (!force && existing?.sourceHash === sourceHash) {
    return existing;
  }

  const result = await analyzePortfolioBlob(blob);
  const [score] = await db
    .insert(portfolioQualityScores)
    .values({
      freelancerId,
      sourceHash: result.sourceHash,
      score: result.score,
      summary: result.summary,
      strengths: result.strengths,
      risks: result.risks,
      raw: result.raw,
      evaluatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: portfolioQualityScores.freelancerId,
      set: {
        sourceHash: result.sourceHash,
        score: result.score,
        summary: result.summary,
        strengths: result.strengths,
        risks: result.risks,
        raw: result.raw,
        evaluatedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();

  return score;
}

export async function upsertFreelancerEmbedding(db: DbClient, freelancerId: string, force = false) {
  const [freelancer] = await db.select().from(freelancers).where(eq(freelancers.id, freelancerId)).limit(1);
  if (!freelancer) return null;

  const [portfolioQuality] = await db
    .select()
    .from(portfolioQualityScores)
    .where(eq(portfolioQualityScores.freelancerId, freelancerId))
    .limit(1);
  const items = await db.select().from(portfolioItems).where(eq(portfolioItems.freelancerId, freelancerId));
  const document = buildFreelancerProfileBlob({ freelancer, portfolioItems: items, portfolioQuality });
  const sourceHash = createSourceHash(document);
  const existing = await findEmbeddingRecord(db, "freelancer", freelancerId);

  if (!force && existing?.sourceHash === sourceHash && existing.status === "embedded") {
    return existing;
  }

  try {
    await markEmbeddingPending(db, "freelancer", freelancerId, sourceHash);
    const embedding = await createEmbedding(document);
    const vectorId = await upsertProfileVector({ freelancerId, embedding, document, sourceHash });
    return markEmbeddingEmbedded(db, {
      ownerType: "freelancer",
      ownerId: freelancerId,
      vectorId,
      collection: env.CHROMA_PROFILE_COLLECTION,
      sourceHash,
      dimensions: embedding.length,
    });
  } catch (error) {
    await markEmbeddingFailed(db, "freelancer", freelancerId, sourceHash, error);
    throw error;
  }
}

export async function upsertProjectEmbedding(db: DbClient, projectId: string, force = false) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;

  const [requirementAnalysis] = await db
    .select()
    .from(projectRequirementAnalyses)
    .where(eq(projectRequirementAnalyses.projectId, projectId))
    .limit(1);
  const document = buildProjectRequirementBlob({ project, requirementAnalysis });
  const sourceHash = createSourceHash(document);
  const existing = await findEmbeddingRecord(db, "project", projectId);

  if (!force && existing?.sourceHash === sourceHash && existing.status === "embedded") {
    return existing;
  }

  try {
    await markEmbeddingPending(db, "project", projectId, sourceHash);
    const embedding = await createEmbedding(document);
    const vectorId = await upsertProjectVector({ projectId, embedding, document, sourceHash });
    return markEmbeddingEmbedded(db, {
      ownerType: "project",
      ownerId: projectId,
      vectorId,
      collection: env.CHROMA_PROJECT_COLLECTION,
      sourceHash,
      dimensions: embedding.length,
    });
  } catch (error) {
    await markEmbeddingFailed(db, "project", projectId, sourceHash, error);
    throw error;
  }
}

export async function removeProjectEmbedding(db: DbClient, projectId: string) {
  await deleteProjectVector(projectId).catch(() => undefined);
  await db
    .delete(aiEmbeddingRecords)
    .where(and(eq(aiEmbeddingRecords.ownerType, "project"), eq(aiEmbeddingRecords.ownerId, projectId)));
}

export async function removeFreelancerEmbedding(db: DbClient, freelancerId: string) {
  await deleteProfileVector(freelancerId).catch(() => undefined);
  await db
    .delete(aiEmbeddingRecords)
    .where(and(eq(aiEmbeddingRecords.ownerType, "freelancer"), eq(aiEmbeddingRecords.ownerId, freelancerId)));
}

export async function listFreelancersForBatchEmbedding(db: DbClient, limit: number) {
  return db.select().from(freelancers).limit(limit);
}

async function findEmbeddingRecord(db: DbClient, ownerType: "freelancer" | "project", ownerId: string) {
  const [record] = await db
    .select()
    .from(aiEmbeddingRecords)
    .where(and(eq(aiEmbeddingRecords.ownerType, ownerType), eq(aiEmbeddingRecords.ownerId, ownerId)))
    .limit(1);
  return record ?? null;
}

async function markEmbeddingPending(db: DbClient, ownerType: "freelancer" | "project", ownerId: string, sourceHash: string) {
  await db
    .insert(aiEmbeddingRecords)
    .values({
      ownerType,
      ownerId,
      vectorId: `${ownerType}:${ownerId}`,
      collection: ownerType === "freelancer" ? env.CHROMA_PROFILE_COLLECTION : env.CHROMA_PROJECT_COLLECTION,
      model: env.QWEN_EMBEDDING_MODEL,
      sourceHash,
      status: "pending",
    })
    .onConflictDoUpdate({
      target: [aiEmbeddingRecords.ownerType, aiEmbeddingRecords.ownerId],
      set: {
        sourceHash,
        status: "pending",
        error: null,
        updatedAt: new Date(),
      },
    });
}

async function markEmbeddingEmbedded(
  db: DbClient,
  input: {
    ownerType: "freelancer" | "project";
    ownerId: string;
    vectorId: string;
    collection: string;
    sourceHash: string;
    dimensions: number;
  },
) {
  const [record] = await db
    .insert(aiEmbeddingRecords)
    .values({
      ...input,
      model: env.QWEN_EMBEDDING_MODEL,
      status: "embedded",
      embeddedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [aiEmbeddingRecords.ownerType, aiEmbeddingRecords.ownerId],
      set: {
        vectorId: input.vectorId,
        collection: input.collection,
        model: env.QWEN_EMBEDDING_MODEL,
        sourceHash: input.sourceHash,
        dimensions: input.dimensions,
        status: "embedded",
        error: null,
        embeddedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();
  return record;
}

async function markEmbeddingFailed(
  db: DbClient,
  ownerType: "freelancer" | "project",
  ownerId: string,
  sourceHash: string,
  error: unknown,
) {
  const message = error instanceof Error ? error.message : String(error);
  await db
    .insert(aiEmbeddingRecords)
    .values({
      ownerType,
      ownerId,
      vectorId: `${ownerType}:${ownerId}`,
      collection: ownerType === "freelancer" ? env.CHROMA_PROFILE_COLLECTION : env.CHROMA_PROJECT_COLLECTION,
      model: env.QWEN_EMBEDDING_MODEL,
      sourceHash,
      status: "failed",
      error: message.slice(0, 1000),
    })
    .onConflictDoUpdate({
      target: [aiEmbeddingRecords.ownerType, aiEmbeddingRecords.ownerId],
      set: {
        sourceHash,
        status: "failed",
        error: message.slice(0, 1000),
        updatedAt: new Date(),
      },
    });
}

function normalizeSkills(skills: string[]) {
  return [...new Set(skills.map((skill) => skill.trim()).filter(Boolean))].slice(0, 50);
}

function sameSkills(left: string[], right: string[]) {
  const normalize = (values: string[]) => values.map((value) => value.toLowerCase()).sort().join("|");
  return normalize(left) === normalize(right);
}

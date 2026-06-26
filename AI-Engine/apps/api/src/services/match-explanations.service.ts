import { and, eq, gt } from "drizzle-orm";
import type { Redis } from "ioredis";
import { z } from "zod";

import { matchExplanations, type DbClient, type freelancers, type projects } from "@tfn/db";

import { env } from "../config/env.js";
import { completeJson } from "./qwen.service.js";
import { createSourceHash } from "./text-blobs.service.js";

type Project = typeof projects.$inferSelect;
type Freelancer = typeof freelancers.$inferSelect;

const explanationSchema = z.object({
  explanation: z.string().min(1).max(1200),
});

function cacheKey(projectId: string, freelancerId: string, sourceHash: string) {
  return `match-explanation:${projectId}:${freelancerId}:${sourceHash}`;
}

export function createExplanationHash(input: { project: Project; freelancer: Freelancer; fit: unknown }) {
  return createSourceHash({
    projectId: input.project.id,
    projectUpdatedAt: input.project.updatedAt,
    freelancerId: input.freelancer.id,
    freelancerUpdatedAt: input.freelancer.updatedAt,
    fit: input.fit,
  });
}

export async function getMatchExplanation(input: {
  db: DbClient;
  redis: Redis;
  project: Project;
  freelancer: Freelancer;
  fit: unknown;
}) {
  const sourceHash = createExplanationHash(input);
  const key = cacheKey(input.project.id, input.freelancer.id, sourceHash);
  const cached = await input.redis.get(key);
  if (cached) {
    return cached;
  }

  const now = new Date();
  const [stored] = await input.db
    .select()
    .from(matchExplanations)
    .where(
      and(
        eq(matchExplanations.projectId, input.project.id),
        eq(matchExplanations.freelancerId, input.freelancer.id),
        eq(matchExplanations.sourceHash, sourceHash),
        gt(matchExplanations.expiresAt, now),
      ),
    )
    .limit(1);

  if (stored) {
    await input.redis.set(key, stored.explanation, "EX", env.MATCH_EXPLANATION_TTL_SECONDS);
    return stored.explanation;
  }

  const generated = await generateExplanation(input.project, input.freelancer, input.fit);
  const expiresAt = new Date(Date.now() + env.MATCH_EXPLANATION_TTL_SECONDS * 1000);

  await input.db
    .insert(matchExplanations)
    .values({
      projectId: input.project.id,
      freelancerId: input.freelancer.id,
      sourceHash,
      explanation: generated,
      model: env.QWEN_CHAT_MODEL,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [matchExplanations.projectId, matchExplanations.freelancerId, matchExplanations.sourceHash],
      set: {
        explanation: generated,
        model: env.QWEN_CHAT_MODEL,
        expiresAt,
        updatedAt: now,
      },
    });

  await input.redis.set(key, generated, "EX", env.MATCH_EXPLANATION_TTL_SECONDS);
  return generated;
}

async function generateExplanation(project: Project, freelancer: Freelancer, fit: unknown) {
  try {
    const result = await completeJson(
      [
        {
          role: "system",
          content:
            "Explain freelancer-project match quality in 2 concise sentences for a marketplace UI. Return JSON with an explanation string.",
        },
        {
          role: "user",
          content: JSON.stringify({
            project: {
              title: project.title,
              description: project.description,
              requiredSkills: project.requiredSkills,
            },
            freelancer: {
              title: freelancer.title,
              bio: freelancer.bio,
              skills: freelancer.skills,
              availability: freelancer.availability,
              ratingAvg: freelancer.ratingAvg,
            },
            fit,
          }),
        },
      ],
      explanationSchema,
    );
    return result.explanation;
  } catch {
    const overlap = freelancer.skills.filter((skill) =>
      project.requiredSkills.some((required) => required.toLowerCase() === skill.toLowerCase()),
    );
    const skillText = overlap.length ? `They match on ${overlap.slice(0, 4).join(", ")}.` : "Their profile is semantically close to the project needs.";
    return `${skillText} Availability is ${freelancer.availability}, with a ${freelancer.ratingAvg.toFixed(1)} average rating.`;
  }
}

import { z } from "zod";

import { createSourceHash } from "./text-blobs.service.js";
import { completeJson } from "./qwen.service.js";

const requirementAnalysisSchema = z.object({
  skills: z.array(z.string()).default([]),
  budgetMinCents: z.number().int().min(0).nullable().default(null),
  budgetMaxCents: z.number().int().min(0).nullable().default(null),
  durationWeeks: z.number().int().min(1).nullable().default(null),
  seniority: z.string().nullable().default(null),
  domain: z.string().nullable().default(null),
  summary: z.string().nullable().default(null),
});

export type RequirementAnalysisResult = z.infer<typeof requirementAnalysisSchema>;

const commonSkillHints = [
  "typescript",
  "javascript",
  "react",
  "next.js",
  "node.js",
  "fastify",
  "nestjs",
  "python",
  "fastapi",
  "postgresql",
  "redis",
  "bullmq",
  "aws",
  "docker",
  "kubernetes",
  "machine learning",
  "llm",
  "nlp",
  "qwen",
  "chroma",
];

function fallbackAnalyze(text: string): RequirementAnalysisResult {
  const normalized = text.toLowerCase();
  const skills = commonSkillHints.filter((skill) => normalized.includes(skill));
  const weeks = normalized.match(/(\d+)\s*(?:week|weeks|wk|wks)/)?.[1];
  const months = normalized.match(/(\d+)\s*(?:month|months)/)?.[1];
  const dollars = [...normalized.matchAll(/\$?\s*(\d{2,7})(?:\s?-\s?\$?\s*(\d{2,7}))?/g)][0];

  return {
    skills,
    budgetMinCents: dollars?.[1] ? Number(dollars[1]) * 100 : null,
    budgetMaxCents: dollars?.[2] ? Number(dollars[2]) * 100 : dollars?.[1] ? Number(dollars[1]) * 100 : null,
    durationWeeks: weeks ? Number(weeks) : months ? Number(months) * 4 : null,
    seniority: normalized.includes("senior") ? "senior" : normalized.includes("junior") ? "junior" : null,
    domain: null,
    summary: text.slice(0, 300),
  };
}

export function buildRequirementSource(input: { title?: string; description: string; requiredSkills?: string[] }) {
  const source = [input.title, input.description, input.requiredSkills?.join(", ")].filter(Boolean).join("\n");
  return { source, sourceHash: createSourceHash(source) };
}

export async function analyzeRequirementText(input: { title?: string; description: string; requiredSkills?: string[] }) {
  const { source, sourceHash } = buildRequirementSource(input);

  try {
    const analysis = await completeJson(
      [
        {
          role: "system",
          content:
            "Extract marketplace project requirements as strict JSON. Normalize skills to concise canonical names. Return only JSON.",
        },
        {
          role: "user",
          content: `Analyze this project requirement:\n${source}`,
        },
      ],
      requirementAnalysisSchema,
    );
    return { ...analysis, sourceHash, raw: analysis };
  } catch {
    const analysis = fallbackAnalyze(source);
    return { ...analysis, sourceHash, raw: { ...analysis, fallback: true } };
  }
}

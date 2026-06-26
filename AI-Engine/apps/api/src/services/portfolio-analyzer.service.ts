import { z } from "zod";

import { createSourceHash } from "./text-blobs.service.js";
import { completeJson } from "./qwen.service.js";

const portfolioScoreSchema = z.object({
  score: z.number().min(0).max(1),
  summary: z.string().nullable().default(null),
  strengths: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
});

export type PortfolioScoreResult = z.infer<typeof portfolioScoreSchema>;

function fallbackScore(blob: string): PortfolioScoreResult {
  const urlCount = (blob.match(/https?:\/\//g) ?? []).length;
  const lengthScore = Math.min(0.4, blob.length / 3000);
  const score = Math.min(1, 0.25 + lengthScore + Math.min(0.35, urlCount * 0.12));

  return {
    score: Number(score.toFixed(2)),
    summary: "Portfolio quality estimated from available profile and portfolio detail.",
    strengths: urlCount ? ["Includes public portfolio links"] : [],
    risks: blob.length < 500 ? ["Limited portfolio detail available"] : [],
  };
}

export async function analyzePortfolioBlob(blob: string) {
  const sourceHash = createSourceHash(blob);

  try {
    const result = await completeJson(
      [
        {
          role: "system",
          content:
            "Evaluate freelancer portfolio quality for a technical marketplace. Return strict JSON with score 0..1, summary, strengths, and risks.",
        },
        { role: "user", content: blob },
      ],
      portfolioScoreSchema,
    );
    return { ...result, sourceHash, raw: result };
  } catch {
    const result = fallbackScore(blob);
    return { ...result, sourceHash, raw: { ...result, fallback: true } };
  }
}

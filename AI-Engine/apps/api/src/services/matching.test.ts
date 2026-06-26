import { describe, expect, it } from "vitest";

import { computeFitScore } from "./matching.js";

describe("computeFitScore", () => {
  it("rewards skill overlap and availability", () => {
    const project = {
      requiredSkills: ["TypeScript", "PostgreSQL", "Redis"],
      budgetMaxCents: 500000,
    } as never;
    const freelancer = {
      skills: ["TypeScript", "PostgreSQL", "Fastify"],
      hourlyRateCents: 9000,
      ratingAvg: 4.5,
      availability: "available",
    } as never;

    const result = computeFitScore(project, freelancer, { semanticScore: 0.8, portfolioQualityScore: 0.7 });

    expect(result.score).toBeGreaterThan(0.7);
    expect(result.percentage).toBeGreaterThan(70);
    expect(result.signals.skillOverlap).toEqual(["typescript", "postgresql"]);
  });
});

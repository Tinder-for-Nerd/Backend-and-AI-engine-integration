import { describe, expect, it } from "vitest";

import { buildFreelancerProfileBlob, buildProjectRequirementBlob, createSourceHash } from "./text-blobs.service.js";

describe("text blob builders", () => {
  it("builds stable freelancer profile text for embedding", () => {
    const freelancer = {
      title: "Full-stack AI engineer",
      bio: "Builds marketplace search systems.",
      location: "Remote",
      skills: ["TypeScript", "Redis", "LLM"],
      availability: "available",
      hourlyRateCents: 10000,
      projectRateCents: null,
      portfolioSummary: "Shipped vector search products.",
      ratingAvg: 4.8,
      ratingCount: 6,
    } as never;

    const blob = buildFreelancerProfileBlob({ freelancer });

    expect(blob).toContain("Skills: TypeScript, Redis, LLM");
    expect(blob).toContain("Availability: available");
    expect(createSourceHash(blob)).toHaveLength(64);
  });

  it("includes extracted requirement analysis in project text", () => {
    const project = {
      title: "NLP matching engine",
      description: "Need embeddings and semantic matching.",
      requiredSkills: ["TypeScript"],
      budgetMinCents: 100000,
      budgetMaxCents: 300000,
    } as never;
    const requirementAnalysis = {
      extractedSkills: ["TypeScript", "Chroma", "Qwen"],
      durationWeeks: 4,
      seniority: "senior",
      domain: "marketplace",
      summary: "Build AI matching.",
    } as never;

    const blob = buildProjectRequirementBlob({ project, requirementAnalysis });

    expect(blob).toContain("Extracted skills: TypeScript, Chroma, Qwen");
    expect(blob).toContain("Duration weeks: 4");
  });
});

import { createHash } from "node:crypto";

import type {
  freelancers,
  portfolioItems,
  portfolioQualityScores,
  projectRequirementAnalyses,
  projects,
} from "@tfn/db";

type Freelancer = typeof freelancers.$inferSelect;
type Project = typeof projects.$inferSelect;
type PortfolioItem = typeof portfolioItems.$inferSelect;
type RequirementAnalysis = typeof projectRequirementAnalyses.$inferSelect;
type PortfolioQualityScore = typeof portfolioQualityScores.$inferSelect;

export function createSourceHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function compactLines(lines: Array<string | null | undefined>) {
  return lines
    .map((line) => line?.trim())
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function buildFreelancerProfileBlob(input: {
  freelancer: Freelancer;
  portfolioItems?: PortfolioItem[] | undefined;
  portfolioQuality?: PortfolioQualityScore | null | undefined;
}) {
  const portfolio = input.portfolioItems?.length
    ? input.portfolioItems
        .map((item) => compactLines([`Portfolio: ${item.title}`, item.description, item.url ? `URL: ${item.url}` : undefined]))
        .join("\n\n")
    : "";

  return compactLines([
    `Freelancer title: ${input.freelancer.title ?? "Not provided"}`,
    input.freelancer.bio ? `Bio: ${input.freelancer.bio}` : undefined,
    input.freelancer.location ? `Location: ${input.freelancer.location}` : undefined,
    input.freelancer.skills.length ? `Skills: ${input.freelancer.skills.join(", ")}` : undefined,
    input.freelancer.portfolioSummary ? `Portfolio summary: ${input.freelancer.portfolioSummary}` : undefined,
    `Availability: ${input.freelancer.availability}`,
    input.freelancer.hourlyRateCents ? `Hourly rate cents: ${input.freelancer.hourlyRateCents}` : undefined,
    input.freelancer.projectRateCents ? `Project rate cents: ${input.freelancer.projectRateCents}` : undefined,
    `Rating: ${input.freelancer.ratingAvg} from ${input.freelancer.ratingCount} reviews`,
    input.portfolioQuality ? `Portfolio quality score: ${input.portfolioQuality.score}` : undefined,
    input.portfolioQuality?.summary ? `Portfolio quality summary: ${input.portfolioQuality.summary}` : undefined,
    portfolio,
  ]);
}

export function buildProjectRequirementBlob(input: {
  project: Project;
  requirementAnalysis?: RequirementAnalysis | null | undefined;
}) {
  const analysis = input.requirementAnalysis;

  return compactLines([
    `Project title: ${input.project.title}`,
    `Description: ${input.project.description}`,
    input.project.requiredSkills.length ? `Required skills: ${input.project.requiredSkills.join(", ")}` : undefined,
    input.project.budgetMinCents ? `Budget min cents: ${input.project.budgetMinCents}` : undefined,
    input.project.budgetMaxCents ? `Budget max cents: ${input.project.budgetMaxCents}` : undefined,
    analysis?.summary ? `Requirement summary: ${analysis.summary}` : undefined,
    analysis?.extractedSkills.length ? `Extracted skills: ${analysis.extractedSkills.join(", ")}` : undefined,
    analysis?.durationWeeks ? `Duration weeks: ${analysis.durationWeeks}` : undefined,
    analysis?.seniority ? `Seniority: ${analysis.seniority}` : undefined,
    analysis?.domain ? `Domain: ${analysis.domain}` : undefined,
  ]);
}

export function buildPortfolioAnalysisBlob(input: {
  freelancer: Freelancer;
  portfolioItems: PortfolioItem[];
}) {
  return compactLines([
    `Freelancer title: ${input.freelancer.title ?? "Not provided"}`,
    input.freelancer.bio ? `Bio: ${input.freelancer.bio}` : undefined,
    input.freelancer.skills.length ? `Skills: ${input.freelancer.skills.join(", ")}` : undefined,
    input.freelancer.portfolioSummary ? `Portfolio summary: ${input.freelancer.portfolioSummary}` : undefined,
    input.portfolioItems
      .map((item) => compactLines([`Portfolio: ${item.title}`, item.description, item.url ? `URL: ${item.url}` : undefined]))
      .join("\n\n"),
  ]);
}

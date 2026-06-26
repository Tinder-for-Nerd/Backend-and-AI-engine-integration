import { createHash } from "node:crypto";

import type {
  freelancers,
  portfolioItems,
  portfolioQualityScores,
  projectRequirementAnalyses,
  projects,
  startups,
} from "@tfn/db";

type Freelancer = typeof freelancers.$inferSelect;
type Project = typeof projects.$inferSelect;
type Startup = typeof startups.$inferSelect;
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

export function buildStartupSearchBlob(input: { startup: Startup }) {
  return compactLines([
    `Startup: ${input.startup.companyName}`,
    input.startup.description ? `Description: ${input.startup.description}` : undefined,
    input.startup.industry ? `Industry: ${input.startup.industry}` : undefined,
    input.startup.companySize ? `Company size: ${input.startup.companySize}` : undefined,
    input.startup.website ? `Website: ${input.startup.website}` : undefined,
  ]);
}

export function buildPortfolioSearchBlob(input: {
  portfolioItem: PortfolioItem;
  freelancer?: Freelancer | null | undefined;
}) {
  return compactLines([
    `Portfolio: ${input.portfolioItem.title}`,
    input.portfolioItem.description ? `Description: ${input.portfolioItem.description}` : undefined,
    input.portfolioItem.url ? `URL: ${input.portfolioItem.url}` : undefined,
    input.freelancer?.title ? `Freelancer title: ${input.freelancer.title}` : undefined,
    input.freelancer?.skills.length ? `Freelancer skills: ${input.freelancer.skills.join(", ")}` : undefined,
  ]);
}

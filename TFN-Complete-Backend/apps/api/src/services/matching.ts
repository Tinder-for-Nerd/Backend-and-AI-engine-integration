import type { freelancers, projects } from "@tfn/db";

type Freelancer = typeof freelancers.$inferSelect;
type Project = typeof projects.$inferSelect;

export interface FitScoreInput {
  semanticScore?: number | undefined;
  lexicalScore?: number | undefined;
  portfolioQualityScore?: number | null | undefined;
  experienceScore?: number | null | undefined;
}

export function computeFitScore(project: Project, freelancer: Freelancer, input: FitScoreInput = {}) {
  const requiredSkills = new Set(project.requiredSkills.map((skill) => skill.toLowerCase()));
  const freelancerSkills = new Set(freelancer.skills.map((skill) => skill.toLowerCase()));
  const overlap = [...requiredSkills].filter((skill) => freelancerSkills.has(skill));
  const skillScore = requiredSkills.size ? overlap.length / requiredSkills.size : 0;

  const rateScore =
    project.budgetMaxCents && freelancer.hourlyRateCents
      ? Math.min(1, project.budgetMaxCents / Math.max(freelancer.hourlyRateCents * 40, 1))
      : 0.5;
  const ratingScore = Math.min(1, freelancer.ratingAvg / 5);
  const availabilityScore = freelancer.availability === "available" ? 1 : freelancer.availability === "limited" ? 0.6 : 0.2;
  const semanticScore = clamp(input.semanticScore ?? 0.5);
  const lexicalScore = clamp(input.lexicalScore ?? skillScore);
  const portfolioScore = clamp(input.portfolioQualityScore ?? 0.5);
  const experienceScore = clamp(input.experienceScore ?? (freelancer.ratingCount > 0 ? Math.min(1, freelancer.ratingCount / 10) : 0.5));
  const freshnessScore = dateFreshnessScore(freelancer.updatedAt);
  const responsivenessScore = clamp(freelancer.profileViews > 0 ? 0.45 + Math.min(0.35, freelancer.profileViews / 1000) : 0.45);
  const locationScore = project.description && freelancer.location ? locationCompatibility(project.description, freelancer.location) : 0.55;
  const riskPenalty = missingDataPenalty(project, freelancer);

  const score =
    skillScore * 0.28 +
    semanticScore * 0.2 +
    lexicalScore * 0.08 +
    experienceScore * 0.1 +
    rateScore * 0.12 +
    availabilityScore * 0.1 +
    portfolioScore * 0.08 +
    ratingScore * 0.05 +
    freshnessScore * 0.04 +
    responsivenessScore * 0.03 +
    locationScore * 0.02 -
    riskPenalty;
  const normalizedScore = clamp(score);

  return {
    score: Number(normalizedScore.toFixed(4)),
    percentage: Math.round(normalizedScore * 100),
    reasonCodes: [
      ...(overlap.length ? ["skill_overlap"] : []),
      ...(semanticScore >= 0.65 ? ["semantic_match"] : []),
      ...(rateScore >= 0.75 ? ["budget_fit"] : []),
      ...(availabilityScore >= 0.9 ? ["available_now"] : []),
      ...(portfolioScore >= 0.7 ? ["portfolio_quality"] : []),
      ...(ratingScore >= 0.8 ? ["high_rating"] : []),
      ...(riskPenalty > 0 ? ["missing_data_risk"] : []),
    ],
    breakdown: {
      skillMatch: Number((skillScore * 0.28).toFixed(4)),
      semanticSimilarity: Number((semanticScore * 0.2).toFixed(4)),
      keywordRelevance: Number((lexicalScore * 0.08).toFixed(4)),
      budgetCompatibility: Number((rateScore * 0.12).toFixed(4)),
      availability: Number((availabilityScore * 0.1).toFixed(4)),
      portfolioQuality: Number((portfolioScore * 0.08).toFixed(4)),
      ratingHistory: Number((ratingScore * 0.05).toFixed(4)),
      completionHistory: Number((experienceScore * 0.1).toFixed(4)),
      freshness: Number((freshnessScore * 0.04).toFixed(4)),
      responsiveness: Number((responsivenessScore * 0.03).toFixed(4)),
      locationCompatibility: Number((locationScore * 0.02).toFixed(4)),
      riskPenalty: Number(riskPenalty.toFixed(4)),
    },
    signals: {
      skillOverlap: overlap,
      skillScore,
      semanticScore,
      lexicalScore,
      experienceScore,
      rateScore,
      portfolioScore,
      ratingScore,
      availabilityScore,
      freshnessScore,
      responsivenessScore,
      locationScore,
      riskPenalty,
    },
  };
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function dateFreshnessScore(value: Date | string | null | undefined) {
  if (!value) return 0.35;
  const updatedAt = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(updatedAt)) return 0.35;
  const ageDays = Math.max(0, (Date.now() - updatedAt) / 86_400_000);
  if (ageDays <= 7) return 1;
  if (ageDays <= 30) return 0.8;
  if (ageDays <= 90) return 0.6;
  return 0.4;
}

function locationCompatibility(projectDescription: string, freelancerLocation: string) {
  const text = projectDescription.toLowerCase();
  const location = freelancerLocation.toLowerCase();
  if (text.includes(location)) return 1;
  if (/\b(remote|async|worldwide|global)\b/.test(text)) return 0.85;
  return 0.55;
}

function missingDataPenalty(project: Project, freelancer: Freelancer) {
  let penalty = 0;
  if (!freelancer.bio) penalty += 0.03;
  if (!freelancer.title) penalty += 0.02;
  if (!freelancer.hourlyRateCents && !freelancer.projectRateCents) penalty += 0.03;
  if (!project.budgetMaxCents && !project.budgetMinCents) penalty += 0.02;
  if (!freelancer.skills.length) penalty += 0.04;
  return Math.min(0.14, penalty);
}

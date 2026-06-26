import type { freelancers, projects } from "@tfn/db";

type Freelancer = typeof freelancers.$inferSelect;
type Project = typeof projects.$inferSelect;

export interface FitScoreInput {
  semanticScore?: number | undefined;
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
  const portfolioScore = clamp(input.portfolioQualityScore ?? 0.5);
  const experienceScore = clamp(input.experienceScore ?? (freelancer.ratingCount > 0 ? Math.min(1, freelancer.ratingCount / 10) : 0.5));

  const score =
    skillScore * 0.28 +
    semanticScore * 0.24 +
    experienceScore * 0.14 +
    rateScore * 0.12 +
    availabilityScore * 0.1 +
    portfolioScore * 0.08 +
    ratingScore * 0.04;

  return {
    score: Number(score.toFixed(4)),
    percentage: Math.round(score * 100),
    signals: {
      skillOverlap: overlap,
      skillScore,
      semanticScore,
      experienceScore,
      rateScore,
      portfolioScore,
      ratingScore,
      availabilityScore,
    },
  };
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

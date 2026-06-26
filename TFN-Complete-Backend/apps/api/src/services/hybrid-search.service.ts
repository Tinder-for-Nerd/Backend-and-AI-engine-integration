import { desc, eq, ilike, inArray, or } from "drizzle-orm";

import { freelancers, portfolioItems, portfolioQualityScores, projects, startups, type DbClient } from "@tfn/db";

import { computeFitScore } from "./matching.js";
import { createEmbedding } from "./qwen.service.js";
import { searchFreelancersForProject } from "./semantic-search.service.js";
import { queryGlobalSearchByEmbedding } from "./vector-store.service.js";

export type SearchEntityType = "freelancer" | "project" | "startup" | "portfolio";

export interface SearchFilters {
  availability?: "available" | "limited" | "unavailable" | undefined;
  location?: string | undefined;
  skills?: string[] | undefined;
  status?: string | undefined;
  minBudgetCents?: number | undefined;
  maxBudgetCents?: number | undefined;
  minRateCents?: number | undefined;
  maxRateCents?: number | undefined;
}

export interface HybridSearchCandidate<T = unknown> {
  id: string;
  type: SearchEntityType;
  title: string;
  subtitle?: string | undefined;
  description?: string | undefined;
  url?: string | undefined;
  entity: T;
  scores: {
    lexical: number;
    semantic: number;
    business: number;
    final: number;
  };
  reasonCodes: string[];
  highlights: string[];
}

export interface ProjectFreelancerCandidate {
  freelancer: typeof freelancers.$inferSelect;
  fit: ReturnType<typeof computeFitScore>;
  vector: { id: string; score: number; sourceHash?: unknown } | null;
  search: {
    lexicalScore: number;
    semanticScore: number;
    reasonCodes: string[];
  };
}

const DEFAULT_TYPES: SearchEntityType[] = ["freelancer", "project", "startup", "portfolio"];

export async function globalHybridSearch(input: {
  db: DbClient;
  query: string;
  types?: SearchEntityType[] | undefined;
  filters?: SearchFilters | undefined;
  limit: number;
}) {
  const types = input.types?.length ? input.types : DEFAULT_TYPES;
  const query = normalizeQuery(input.query);
  const tokens = tokenize(query);
  const lexical = await lexicalGlobalSearch(input.db, { query, tokens, types, filters: input.filters, limit: Math.max(input.limit * 4, 40) });
  const semantic = await semanticGlobalSearch({ query, types, limit: Math.max(input.limit * 4, 40) });
  const merged = mergeSearchCandidates([...lexical, ...semantic]);
  return diversifyGlobalResults(merged).slice(0, input.limit);
}

export async function suggestSearchTerms(input: { db: DbClient; query: string; limit: number }) {
  const results = await globalHybridSearch({ db: input.db, query: input.query, limit: input.limit, types: ["freelancer", "project", "startup"] });
  return results.map((item) => ({
    id: item.id,
    type: item.type,
    label: item.title,
    subtitle: item.subtitle,
    reasonCodes: item.reasonCodes,
  }));
}

export async function findHybridFreelancerCandidatesForProject(input: {
  db: DbClient;
  project: typeof projects.$inferSelect;
  limit: number;
}): Promise<ProjectFreelancerCandidate[]> {
  const semanticResults = await searchFreelancerSemantic(input.db, input.project.id, Math.max(input.limit * 4, 50));
  const semanticById = new Map(
    semanticResults
      .map((result) => [typeof result.metadata.freelancerId === "string" ? result.metadata.freelancerId : "", result] as const)
      .filter(([freelancerId]) => Boolean(freelancerId)),
  );
  const lexicalCandidates = await input.db.select().from(freelancers).limit(250);
  const mergedIds = new Set<string>([...semanticById.keys(), ...lexicalCandidates.map((freelancer) => freelancer.id)]);
  const ids = [...mergedIds];
  if (!ids.length) return [];

  const rows = await input.db.select().from(freelancers).where(inArray(freelancers.id, ids));
  const qualities = await input.db.select().from(portfolioQualityScores).where(inArray(portfolioQualityScores.freelancerId, ids));
  const qualityByFreelancer = new Map(qualities.map((quality) => [quality.freelancerId, quality]));
  const projectTokens = tokenize([input.project.title, input.project.description, input.project.requiredSkills.join(" ")].join(" "));

  return rows
    .filter((freelancer) => passesFreelancerProjectHardFilters(input.project, freelancer))
    .map((freelancer) => {
      const semantic = semanticById.get(freelancer.id);
      const lexicalScore = scoreFreelancerForTokens(freelancer, projectTokens);
      const semanticScore = semantic?.score ?? 0;
      const quality = qualityByFreelancer.get(freelancer.id);
      const fit = computeFitScore(input.project, freelancer, {
        semanticScore: semanticScore || blendedFallbackSemantic(lexicalScore),
        portfolioQualityScore: quality?.score,
        lexicalScore,
      });
      return {
        freelancer,
        fit,
        vector: semantic
          ? {
              id: semantic.id,
              score: semantic.score,
              sourceHash: semantic.metadata.sourceHash,
            }
          : null,
        search: {
          lexicalScore,
          semanticScore,
          reasonCodes: reasonCodesForFreelancerMatch(input.project, freelancer, fit, lexicalScore, semanticScore),
        },
      };
    })
    .sort((a, b) => b.fit.score - a.fit.score)
    .slice(0, input.limit);
}

export function tokenize(text: string) {
  return normalizeQuery(text)
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9+#.-]/gi, ""))
    .filter((token) => token.length >= 2);
}

export function computeWeightedLexicalScore(tokens: string[], fields: Array<{ value?: string | null; weight: number }>) {
  if (!tokens.length) return 0;
  const totalWeight = fields.reduce((sum, field) => sum + field.weight, 0) || 1;
  const score = fields.reduce((sum, field) => {
    const value = normalizeQuery(field.value ?? "");
    if (!value) return sum;
    const matches = tokens.filter((token) => value.includes(token)).length;
    return sum + (matches / tokens.length) * field.weight;
  }, 0);
  return clamp01(score / totalWeight);
}

export function mergeSearchCandidates(candidates: HybridSearchCandidate[]) {
  const byKey = new Map<string, HybridSearchCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.type}:${candidate.id}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, candidate);
      continue;
    }
    existing.scores.lexical = Math.max(existing.scores.lexical, candidate.scores.lexical);
    existing.scores.semantic = Math.max(existing.scores.semantic, candidate.scores.semantic);
    existing.scores.business = Math.max(existing.scores.business, candidate.scores.business);
    existing.scores.final = finalSearchScore(existing.scores.lexical, existing.scores.semantic, existing.scores.business);
    existing.reasonCodes = [...new Set([...existing.reasonCodes, ...candidate.reasonCodes])];
    existing.highlights = [...new Set([...existing.highlights, ...candidate.highlights])].slice(0, 5);
  }
  return [...byKey.values()].sort((a, b) => b.scores.final - a.scores.final);
}

async function lexicalGlobalSearch(
  db: DbClient,
  input: { query: string; tokens: string[]; types: SearchEntityType[]; filters?: SearchFilters | undefined; limit: number },
) {
  const searches: Array<Promise<HybridSearchCandidate[]>> = [];
  if (input.types.includes("freelancer")) searches.push(lexicalFreelancers(db, input));
  if (input.types.includes("project")) searches.push(lexicalProjects(db, input));
  if (input.types.includes("startup")) searches.push(lexicalStartups(db, input));
  if (input.types.includes("portfolio")) searches.push(lexicalPortfolio(db, input));
  return (await Promise.all(searches)).flat();
}

async function lexicalFreelancers(
  db: DbClient,
  input: { query: string; tokens: string[]; filters?: SearchFilters | undefined; limit: number },
): Promise<HybridSearchCandidate[]> {
  const rows = await db
    .select()
    .from(freelancers)
    .where(
      input.query
        ? or(ilike(freelancers.title, `%${input.query}%`), ilike(freelancers.bio, `%${input.query}%`), ilike(freelancers.location, `%${input.query}%`))
        : undefined,
    )
    .orderBy(desc(freelancers.updatedAt))
    .limit(input.limit);

  return rows
    .filter((freelancer) => passesFreelancerFilters(freelancer, input.filters))
    .map((freelancer) => {
      const lexical = scoreFreelancerForTokens(freelancer, input.tokens);
      const business = freelancer.availability === "available" ? 0.8 : freelancer.availability === "limited" ? 0.55 : 0.1;
      return {
        id: freelancer.id,
        type: "freelancer" as const,
        title: freelancer.title ?? "Freelancer",
        subtitle: [freelancer.location, freelancer.skills.slice(0, 4).join(", ")].filter(Boolean).join(" | "),
        description: freelancer.bio ?? freelancer.portfolioSummary ?? undefined,
        entity: freelancer,
        scores: {
          lexical,
          semantic: 0,
          business,
          final: finalSearchScore(lexical, 0, business),
        },
        reasonCodes: reasonCodesForGlobal({ lexical, semantic: 0, business, extra: freelancer.availability === "available" ? ["available_now"] : [] }),
        highlights: buildHighlights(input.tokens, [freelancer.title, freelancer.bio, freelancer.location, freelancer.skills.join(", ")]),
      };
    })
    .filter((item) => item.scores.final > 0 || !input.query);
}

async function lexicalProjects(
  db: DbClient,
  input: { query: string; tokens: string[]; filters?: SearchFilters | undefined; limit: number },
): Promise<HybridSearchCandidate[]> {
  const rows = await db
    .select()
    .from(projects)
    .where(input.query ? or(ilike(projects.title, `%${input.query}%`), ilike(projects.description, `%${input.query}%`)) : undefined)
    .orderBy(desc(projects.createdAt))
    .limit(input.limit);

  return rows
    .filter((project) => passesProjectFilters(project, input.filters))
    .map((project) => {
      const lexical = computeWeightedLexicalScore(input.tokens, [
        { value: project.title, weight: 4 },
        { value: project.requiredSkills.join(" "), weight: 3 },
        { value: project.description, weight: 2 },
      ]);
      const business = project.status === "open" ? 0.85 : project.status === "paused" ? 0.35 : 0.05;
      return {
        id: project.id,
        type: "project" as const,
        title: project.title,
        subtitle: [project.status, project.requiredSkills.slice(0, 4).join(", ")].filter(Boolean).join(" | "),
        description: project.description,
        entity: project,
        scores: {
          lexical,
          semantic: 0,
          business,
          final: finalSearchScore(lexical, 0, business),
        },
        reasonCodes: reasonCodesForGlobal({ lexical, semantic: 0, business, extra: project.status === "open" ? ["open_project"] : [] }),
        highlights: buildHighlights(input.tokens, [project.title, project.description, project.requiredSkills.join(", ")]),
      };
    })
    .filter((item) => item.scores.final > 0 || !input.query);
}

async function lexicalStartups(
  db: DbClient,
  input: { query: string; tokens: string[]; filters?: SearchFilters | undefined; limit: number },
): Promise<HybridSearchCandidate[]> {
  const rows = await db
    .select()
    .from(startups)
    .where(
      input.query
        ? or(ilike(startups.companyName, `%${input.query}%`), ilike(startups.description, `%${input.query}%`), ilike(startups.industry, `%${input.query}%`))
        : undefined,
    )
    .orderBy(desc(startups.updatedAt))
    .limit(input.limit);

  return rows.map((startup) => {
    const lexical = computeWeightedLexicalScore(input.tokens, [
      { value: startup.companyName, weight: 4 },
      { value: startup.industry, weight: 3 },
      { value: startup.description, weight: 2 },
      { value: startup.companySize, weight: 1 },
    ]);
    const business = startup.description ? 0.75 : 0.45;
    return {
      id: startup.id,
      type: "startup" as const,
      title: startup.companyName,
      subtitle: [startup.industry, startup.companySize].filter(Boolean).join(" | "),
      description: startup.description ?? undefined,
      url: startup.website ?? undefined,
      entity: startup,
      scores: {
        lexical,
        semantic: 0,
        business,
        final: finalSearchScore(lexical, 0, business),
      },
      reasonCodes: reasonCodesForGlobal({ lexical, semantic: 0, business }),
      highlights: buildHighlights(input.tokens, [startup.companyName, startup.industry, startup.description]),
    };
  });
}

async function lexicalPortfolio(
  db: DbClient,
  input: { query: string; tokens: string[]; limit: number },
): Promise<HybridSearchCandidate[]> {
  const rows = await db
    .select()
    .from(portfolioItems)
    .where(input.query ? or(ilike(portfolioItems.title, `%${input.query}%`), ilike(portfolioItems.description, `%${input.query}%`)) : undefined)
    .orderBy(desc(portfolioItems.createdAt))
    .limit(input.limit);

  return rows.map((item) => {
    const lexical = computeWeightedLexicalScore(input.tokens, [
      { value: item.title, weight: 4 },
      { value: item.description, weight: 3 },
      { value: item.url, weight: 1 },
    ]);
    const business = item.url ? 0.7 : 0.45;
    return {
      id: item.id,
      type: "portfolio" as const,
      title: item.title,
      description: item.description ?? undefined,
      url: item.url ?? undefined,
      entity: item,
      scores: {
        lexical,
        semantic: 0,
        business,
        final: finalSearchScore(lexical, 0, business),
      },
      reasonCodes: reasonCodesForGlobal({ lexical, semantic: 0, business, extra: ["portfolio_quality"] }),
      highlights: buildHighlights(input.tokens, [item.title, item.description, item.url]),
    };
  });
}

async function semanticGlobalSearch(input: { query: string; types: SearchEntityType[]; limit: number }): Promise<HybridSearchCandidate[]> {
  if (!input.query) return [];
  try {
    const embedding = await createEmbedding(input.query);
    const results = await queryGlobalSearchByEmbedding(embedding, input.limit);
    const candidates: HybridSearchCandidate[] = [];
    for (const result of results) {
        const type = result.metadata.entityType;
        const id = result.metadata.entityId;
        if (!isSearchEntityType(type) || typeof id !== "string" || !input.types.includes(type)) continue;
        const title = typeof result.metadata.title === "string" ? result.metadata.title : typeLabel(type);
        candidates.push({
          id,
          type,
          title,
          description: result.document,
          entity: {
            id,
            type,
            metadata: result.metadata,
          },
          scores: {
            lexical: 0,
            semantic: result.score,
            business: 0.5,
            final: finalSearchScore(0, result.score, 0.5),
          },
          reasonCodes: reasonCodesForGlobal({ lexical: 0, semantic: result.score, business: 0.5 }),
          highlights: [],
        });
    }
    return candidates;
  } catch {
    return [];
  }
}

async function searchFreelancerSemantic(db: DbClient, projectId: string, limit: number) {
  try {
    return (await searchFreelancersForProject({ db, projectId, limit })).results;
  } catch {
    return [];
  }
}

function normalizeQuery(query: string) {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function scoreFreelancerForTokens(freelancer: typeof freelancers.$inferSelect, tokens: string[]) {
  return computeWeightedLexicalScore(tokens, [
    { value: freelancer.title, weight: 4 },
    { value: freelancer.skills.join(" "), weight: 4 },
    { value: freelancer.bio, weight: 2 },
    { value: freelancer.portfolioSummary, weight: 1.5 },
    { value: freelancer.location, weight: 1 },
  ]);
}

function passesFreelancerFilters(freelancer: typeof freelancers.$inferSelect, filters?: SearchFilters) {
  if (filters?.availability && freelancer.availability !== filters.availability) return false;
  if (filters?.location && !normalizeQuery(freelancer.location ?? "").includes(normalizeQuery(filters.location))) return false;
  if (filters?.skills?.length) {
    const freelancerSkills = new Set(freelancer.skills.map((skill) => normalizeQuery(skill)));
    if (!filters.skills.some((skill) => freelancerSkills.has(normalizeQuery(skill)))) return false;
  }
  if (filters?.minRateCents && (freelancer.hourlyRateCents ?? 0) < filters.minRateCents) return false;
  if (filters?.maxRateCents && (freelancer.hourlyRateCents ?? Number.POSITIVE_INFINITY) > filters.maxRateCents) return false;
  return true;
}

function passesProjectFilters(project: typeof projects.$inferSelect, filters?: SearchFilters) {
  if (filters?.status && project.status !== filters.status) return false;
  if (filters?.minBudgetCents && (project.budgetMaxCents ?? 0) < filters.minBudgetCents) return false;
  if (filters?.maxBudgetCents && (project.budgetMinCents ?? Number.POSITIVE_INFINITY) > filters.maxBudgetCents) return false;
  if (filters?.skills?.length) {
    const requiredSkills = new Set(project.requiredSkills.map((skill) => normalizeQuery(skill)));
    if (!filters.skills.some((skill) => requiredSkills.has(normalizeQuery(skill)))) return false;
  }
  return true;
}

function passesFreelancerProjectHardFilters(project: typeof projects.$inferSelect, freelancer: typeof freelancers.$inferSelect) {
  if (freelancer.availability === "unavailable") return false;
  if (project.status !== "open") return false;
  if (!project.budgetMaxCents || !freelancer.hourlyRateCents) return true;
  const minimumPracticalBudget = freelancer.hourlyRateCents * 20;
  return minimumPracticalBudget <= project.budgetMaxCents * 1.5;
}

function blendedFallbackSemantic(lexicalScore: number) {
  return clamp01(0.35 + lexicalScore * 0.45);
}

function finalSearchScore(lexical: number, semantic: number, business: number) {
  return Number(clamp01(lexical * 0.36 + semantic * 0.44 + business * 0.2).toFixed(4));
}

function reasonCodesForGlobal(input: { lexical: number; semantic: number; business: number; extra?: string[] }) {
  return [
    ...(input.lexical >= 0.2 ? ["keyword_match"] : []),
    ...(input.semantic >= 0.5 ? ["semantic_match"] : []),
    ...(input.business >= 0.7 ? ["business_fit"] : []),
    ...(input.extra ?? []),
  ];
}

function reasonCodesForFreelancerMatch(
  project: typeof projects.$inferSelect,
  freelancer: typeof freelancers.$inferSelect,
  fit: ReturnType<typeof computeFitScore>,
  lexicalScore: number,
  semanticScore: number,
) {
  return [
    ...(fit.signals.skillOverlap.length ? ["skill_overlap"] : []),
    ...(semanticScore >= 0.5 ? ["semantic_match"] : []),
    ...(lexicalScore >= 0.25 ? ["keyword_match"] : []),
    ...(fit.signals.rateScore >= 0.75 ? ["budget_fit"] : []),
    ...(freelancer.availability === "available" ? ["available_now"] : []),
    ...(fit.signals.portfolioScore >= 0.7 ? ["portfolio_quality"] : []),
    ...(project.status === "open" ? ["open_project"] : []),
  ];
}

function buildHighlights(tokens: string[], fields: Array<string | null | undefined>) {
  if (!tokens.length) return [];
  return fields
    .filter((field): field is string => Boolean(field))
    .filter((field) => {
      const normalized = normalizeQuery(field);
      return tokens.some((token) => normalized.includes(token));
    })
    .map((field) => field.slice(0, 180))
    .slice(0, 3);
}

function diversifyGlobalResults(candidates: HybridSearchCandidate[]) {
  const seenTypes = new Map<SearchEntityType, number>();
  return [...candidates]
    .sort((a, b) => {
      const aPenalty = (seenTypes.get(a.type) ?? 0) * 0.015;
      const bPenalty = (seenTypes.get(b.type) ?? 0) * 0.015;
      return b.scores.final - bPenalty - (a.scores.final - aPenalty);
    })
    .map((candidate) => {
      seenTypes.set(candidate.type, (seenTypes.get(candidate.type) ?? 0) + 1);
      return candidate;
    });
}

function isSearchEntityType(value: unknown): value is SearchEntityType {
  return value === "freelancer" || value === "project" || value === "startup" || value === "portfolio";
}

function typeLabel(type: SearchEntityType) {
  return type[0]!.toUpperCase() + type.slice(1);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

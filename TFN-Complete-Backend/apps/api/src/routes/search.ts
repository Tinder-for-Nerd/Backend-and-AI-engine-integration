import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  globalHybridSearch,
  suggestSearchTerms,
  type SearchEntityType,
  type SearchFilters,
} from "../services/hybrid-search.service.js";
import { parseQuery } from "../utils/validation.js";

const searchQuerySchema = z.object({
  q: z.string().max(300).default(""),
  type: z.string().default("all"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  filters: z.string().optional(),
});

const suggestQuerySchema = z.object({
  q: z.string().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export async function searchRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const query = parseQuery(searchQuerySchema, request.query);
    const types = parseTypes(query.type);
    const filters = parseFilters(query.filters);
    const items = await globalHybridSearch({
      db: app.db,
      query: query.q,
      types,
      filters,
      limit: query.limit,
    });

    return {
      query: query.q,
      types: types ?? ["freelancer", "project", "startup", "portfolio"],
      filters,
      items,
      meta: {
        count: items.length,
        fallbackMode: items.every((item) => item.scores.semantic === 0),
      },
    };
  });

  app.get("/suggest", async (request) => {
    const query = parseQuery(suggestQuerySchema, request.query);
    const suggestions = await suggestSearchTerms({ db: app.db, query: query.q, limit: query.limit });
    return {
      query: query.q,
      suggestions,
    };
  });
}

function parseTypes(type: string): SearchEntityType[] | undefined {
  if (!type || type === "all") return undefined;
  const values = type
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const parsed = values.filter(isSearchEntityType);
  return parsed.length ? [...new Set(parsed)] : undefined;
}

function parseFilters(raw: string | undefined): SearchFilters | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const result = filtersSchema.safeParse(parsed);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

const filtersSchema = z.object({
  availability: z.enum(["available", "limited", "unavailable"]).optional(),
  personName: z.string().max(160).optional(),
  location: z.string().max(160).optional(),
  skills: z.array(z.string().min(1).max(80)).max(20).optional(),
  skillMatchMode: z.enum(["any", "all"]).optional(),
  status: z.string().max(40).optional(),
  minBudgetCents: z.number().int().min(0).optional(),
  maxBudgetCents: z.number().int().min(0).optional(),
  minRateCents: z.number().int().min(0).optional(),
  maxRateCents: z.number().int().min(0).optional(),
});

function isSearchEntityType(value: string): value is SearchEntityType {
  return value === "freelancer" || value === "project" || value === "startup" || value === "portfolio";
}

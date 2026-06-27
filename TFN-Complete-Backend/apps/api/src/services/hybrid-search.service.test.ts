import { describe, expect, it } from "vitest";

import {
  computeWeightedLexicalScore,
  matchesSkillFilter,
  mergeSearchCandidates,
  tokenize,
  type HybridSearchCandidate,
} from "./hybrid-search.service.js";

describe("hybrid search helpers", () => {
  it("scores weighted lexical matches across important fields", () => {
    const tokens = tokenize("senior react fintech");
    const score = computeWeightedLexicalScore(tokens, [
      { value: "Senior React Engineer", weight: 4 },
      { value: "Fintech marketplace payments", weight: 2 },
      { value: "Python Django", weight: 1 },
    ]);

    expect(score).toBeGreaterThan(0.45);
  });

  it("merges lexical and semantic duplicates into one stronger candidate", () => {
    const base = {
      id: "profile-1",
      type: "freelancer",
      title: "React engineer",
      entity: {},
      highlights: [],
    } satisfies Partial<HybridSearchCandidate>;

    const merged = mergeSearchCandidates([
      {
        ...base,
        scores: { lexical: 0.7, semantic: 0, business: 0.8, final: 0.5 },
        reasonCodes: ["keyword_match"],
      } as HybridSearchCandidate,
      {
        ...base,
        scores: { lexical: 0, semantic: 0.9, business: 0.5, final: 0.6 },
        reasonCodes: ["semantic_match"],
      } as HybridSearchCandidate,
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]!.scores.lexical).toBe(0.7);
    expect(merged[0]!.scores.semantic).toBe(0.9);
    expect(merged[0]!.reasonCodes).toEqual(expect.arrayContaining(["keyword_match", "semantic_match"]));
  });

  it("supports strict all-skills targeting for specific-person searches", () => {
    const candidateSkills = ["React", "Node.js", "PostgreSQL"];

    expect(matchesSkillFilter(candidateSkills, ["React", "PostgreSQL"], "all")).toBe(true);
    expect(matchesSkillFilter(candidateSkills, ["React", "Python"], "all")).toBe(false);
    expect(matchesSkillFilter(candidateSkills, ["Python", "Node.js"], "any")).toBe(true);
  });
});

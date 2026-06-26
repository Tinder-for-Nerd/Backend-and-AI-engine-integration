import { describe, expect, it } from "vitest";

import { rerankWithSignals } from "./reranker.service.js";

describe("rerankWithSignals", () => {
  it("boosts hires and lowers skipped freelancers", () => {
    const matches = [
      { freelancerId: "a", score: 0.8, item: { freelancerId: "a" } },
      { freelancerId: "b", score: 0.78, item: { freelancerId: "b" } },
    ];
    const signals = [
      { freelancerId: "a", signal: "skip", weight: 1 },
      { freelancerId: "b", signal: "hire", weight: 1 },
    ] as never;

    const result = rerankWithSignals(matches, signals);

    expect(result[0]!.freelancerId).toBe("b");
    expect(result[0]!.rerank.signalAdjustment).toBeGreaterThan(0);
    expect(result[1]!.rerank.signalAdjustment).toBeLessThan(0);
  });
});

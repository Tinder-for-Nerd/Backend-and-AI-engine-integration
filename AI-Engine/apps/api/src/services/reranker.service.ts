import type { matchSignals } from "@tfn/db";

type MatchSignal = typeof matchSignals.$inferSelect;

export interface RerankableMatch<T> {
  freelancerId: string;
  score: number;
  item: T;
}

const baseSignalWeights: Record<string, number> = {
  view: 0.01,
  save: 0.08,
  apply: 0.1,
  invite: 0.12,
  hire: 0.2,
  skip: -0.12,
  dismiss: -0.18,
};

export function rerankWithSignals<T>(matches: Array<RerankableMatch<T>>, signals: MatchSignal[]) {
  const signalScoreByFreelancer = new Map<string, number>();

  for (const signal of signals) {
    if (!signal.freelancerId) continue;
    const base = baseSignalWeights[signal.signal] ?? 0;
    const current = signalScoreByFreelancer.get(signal.freelancerId) ?? 0;
    signalScoreByFreelancer.set(signal.freelancerId, current + base * signal.weight);
  }

  return matches
    .map((match) => {
      const signalAdjustment = signalScoreByFreelancer.get(match.freelancerId) ?? 0;
      const rerankedScore = Math.max(0, Math.min(1, match.score + signalAdjustment));
      return {
        ...match.item,
        rerank: {
          baseScore: match.score,
          signalAdjustment,
          score: Number(rerankedScore.toFixed(4)),
          percentage: Math.round(rerankedScore * 100),
        },
      };
    })
    .sort((a, b) => b.rerank.score - a.rerank.score);
}

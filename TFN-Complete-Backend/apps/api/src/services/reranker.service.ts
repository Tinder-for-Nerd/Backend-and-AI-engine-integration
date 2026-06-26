import type { matchSignals } from "@tfn/db";

type MatchSignal = typeof matchSignals.$inferSelect;

export interface RerankableMatch<T> {
  freelancerId: string;
  score: number;
  item: T;
}

const baseSignalWeights: Record<string, number> = {
  view: 0.015,
  save: 0.08,
  apply: 0.1,
  invite: 0.12,
  hire: 0.2,
  skip: -0.12,
  dismiss: -0.18,
};

export function rerankWithSignals<T>(matches: Array<RerankableMatch<T>>, signals: MatchSignal[]) {
  const signalScoreByFreelancer = new Map<string, { raw: number; reasons: Set<string> }>();
  const countsByFreelancerAndSignal = new Map<string, number>();

  for (const signal of signals) {
    if (!signal.freelancerId) continue;
    const base = baseSignalWeights[signal.signal] ?? 0;
    const key = `${signal.freelancerId}:${signal.signal}`;
    const seenCount = countsByFreelancerAndSignal.get(key) ?? 0;
    countsByFreelancerAndSignal.set(key, seenCount + 1);
    const saturation = 1 / Math.sqrt(seenCount + 1);
    const recency = recencyMultiplier(signal.createdAt);
    const weighted = base * signal.weight * saturation * recency;
    const current = signalScoreByFreelancer.get(signal.freelancerId) ?? { raw: 0, reasons: new Set<string>() };
    current.raw += weighted;
    if (weighted >= 0.05) current.reasons.add("strong_signal_history");
    if (weighted <= -0.05) current.reasons.add("negative_signal_history");
    signalScoreByFreelancer.set(signal.freelancerId, current);
  }

  return matches
    .map((match) => {
      const signal = signalScoreByFreelancer.get(match.freelancerId);
      const signalAdjustment = signal ? Math.tanh(signal.raw) * 0.22 : 0;
      const rerankedScore = Math.max(0, Math.min(1, match.score + signalAdjustment));
      return {
        ...match.item,
        rerank: {
          baseScore: match.score,
          signalAdjustment: Number(signalAdjustment.toFixed(4)),
          score: Number(rerankedScore.toFixed(4)),
          percentage: Math.round(rerankedScore * 100),
          reasonCodes: [...(signal?.reasons ?? [])],
        },
      };
    })
    .sort((a, b) => b.rerank.score - a.rerank.score);
}

function recencyMultiplier(createdAt: Date | string | null | undefined) {
  if (!createdAt) return 0.75;
  const time = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  if (Number.isNaN(time)) return 0.75;
  const ageDays = Math.max(0, (Date.now() - time) / 86_400_000);
  if (ageDays <= 1) return 1;
  if (ageDays <= 7) return 0.85;
  if (ageDays <= 30) return 0.6;
  if (ageDays <= 90) return 0.35;
  return 0.15;
}

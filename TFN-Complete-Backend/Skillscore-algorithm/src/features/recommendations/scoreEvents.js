const eventWeights = {
  student: {
    topicOverlap: 0.42,
    goalFit: 0.22,
    industryFit: 0.1,
    hostConnections: 0.1,
    peerDensity: 0.08,
    freshness: 0.08
  },
  pro: {
    hostConnections: 0.28,
    peerDensity: 0.22,
    industryFit: 0.18,
    goalFit: 0.14,
    topicOverlap: 0.1,
    freshness: 0.08
  }
};

export function getEventWeights(userType) {
  return eventWeights[userType] ?? eventWeights.student;
}

export function scoreEvent(event, signal) {
  const weights = getEventWeights(signal.userType);
  const contributions = {
    topicOverlap: overlapScore(event.topics, signal.skills),
    goalFit: overlapScore(event.goals, signal.goals),
    industryFit: overlapScore(event.industries, signal.industries),
    hostConnections: overlapScore(event.hostConnectionIds, signal.mutualConnectionIds),
    peerDensity: event.peerDensity,
    freshness: event.freshnessScore
  };
  const dwellBoost = Math.min(signal.dwellByEntityId[event.id] ?? 0, 3) * 0.025;
  const rsvpPenalty = signal.rsvpedEventIds.includes(event.id) ? -0.06 : 0;
  const score = weightedScore(contributions, weights) + dwellBoost + rsvpPenalty;

  return {
    ...event,
    score: clamp(score),
    contributions,
    reasons: buildEventReasons(event, contributions, signal.userType)
  };
}

export function rankEvents(events, signal) {
  return events.map((event) => scoreEvent(event, signal)).sort((a, b) => b.score - a.score);
}

function buildEventReasons(event, contributions, userType) {
  const strongest = Object.entries(contributions).sort((a, b) => b[1] - a[1])[0];
  const priority =
    userType === "student"
      ? "Student event scoring favors learning topic overlap."
      : "Pro event scoring favors trusted host paths and peer density.";

  return [priority, `${labelFor(strongest[0])} is strongest here.`, event.capacitySignal];
}

function overlapScore(a = [], b = []) {
  if (!a.length || !b.length) return 0;
  const target = new Set(b.map((item) => item.toLowerCase()));
  const matches = a.filter((item) => target.has(item.toLowerCase())).length;
  return matches / Math.max(a.length, b.length);
}

function weightedScore(contributions, weights) {
  return Object.entries(weights).reduce(
    (total, [key, weight]) => total + (contributions[key] ?? 0) * weight,
    0
  );
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function labelFor(key) {
  return {
    topicOverlap: "Topic overlap",
    goalFit: "Goal fit",
    industryFit: "Industry fit",
    hostConnections: "Host connections",
    peerDensity: "Peer density",
    freshness: "Freshness"
  }[key];
}

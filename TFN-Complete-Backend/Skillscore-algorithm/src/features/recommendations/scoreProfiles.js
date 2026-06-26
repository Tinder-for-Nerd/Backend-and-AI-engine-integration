const profileWeights = {
  student: {
    skillOverlap: 0.5,
    goalFit: 0.18,
    industryFit: 0.1,
    mutualConnections: 0.12,
    activity: 0.1
  },
  pro: {
    mutualConnections: 0.4,
    industryFit: 0.18,
    goalFit: 0.16,
    skillOverlap: 0.16,
    activity: 0.1
  }
};

export function getProfileWeights(userType) {
  return profileWeights[userType] ?? profileWeights.student;
}

export function scoreProfile(profile, signal) {
  const weights = getProfileWeights(signal.userType);
  const contributions = {
    skillOverlap: overlapScore(profile.skills, signal.skills),
    goalFit: overlapScore(profile.goals, signal.goals),
    industryFit: overlapScore(profile.industries, signal.industries),
    mutualConnections: overlapScore(profile.mutualConnectionIds, signal.mutualConnectionIds),
    activity: profile.activityScore
  };
  const dwellBoost = Math.min(signal.dwellByEntityId[profile.id] ?? 0, 3) * 0.025;
  const connectedPenalty = signal.connectedProfileIds.includes(profile.id) ? -0.08 : 0;
  const score = weightedScore(contributions, weights) + dwellBoost + connectedPenalty;

  return {
    ...profile,
    score: clamp(score),
    contributions,
    reasons: buildProfileReasons(profile, contributions, signal.userType)
  };
}

export function rankProfiles(profiles, signal) {
  return profiles
    .map((profile) => scoreProfile(profile, signal))
    .sort((a, b) => b.score - a.score);
}

function buildProfileReasons(profile, contributions, userType) {
  const strongest = Object.entries(contributions).sort((a, b) => b[1] - a[1])[0];
  const priority =
    userType === "student"
      ? "Skill overlap is weighted highest for students."
      : "Warm mutual paths are weighted highest for pros.";

  return [
    priority,
    `${labelFor(strongest[0])} is driving this match.`,
    `${profile.availability}.`
  ];
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
    skillOverlap: "Skill overlap",
    goalFit: "Goal fit",
    industryFit: "Industry fit",
    mutualConnections: "Mutual connections",
    activity: "Recent activity"
  }[key];
}

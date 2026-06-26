const initialSignals = {
  student: {
    userType: "student",
    skills: ["React", "Product", "Pitching"],
    goals: ["ship prototype", "find cofounder", "practice demos"],
    industries: ["AI Tools", "Education", "Climate"],
    mutualConnectionIds: ["nina-ross", "founder-lab"],
    connectedProfileIds: [],
    rsvpedEventIds: [],
    dwellByEntityId: {},
    explorationCursor: 0,
    recentActions: []
  },
  pro: {
    userType: "pro",
    skills: ["Growth", "Analytics", "Partnerships", "Mentoring"],
    goals: ["source builders", "mentor founders", "host founder dinners"],
    industries: ["Startups", "SaaS", "Developer Tools"],
    mutualConnectionIds: ["nina-ross", "lee-ops", "founder-lab"],
    connectedProfileIds: [],
    rsvpedEventIds: [],
    dwellByEntityId: {},
    explorationCursor: 0,
    recentActions: []
  }
};

export function createUserSignal(userType = "student") {
  const signal = initialSignals[userType] ?? initialSignals.student;
  return structuredClone(signal);
}

export function reduceSignalWithFeedback(signal, action) {
  const next = {
    ...signal,
    skills: [...signal.skills],
    goals: [...signal.goals],
    industries: [...signal.industries],
    mutualConnectionIds: [...signal.mutualConnectionIds],
    connectedProfileIds: [...signal.connectedProfileIds],
    rsvpedEventIds: [...signal.rsvpedEventIds],
    dwellByEntityId: { ...signal.dwellByEntityId },
    recentActions: [action, ...signal.recentActions].slice(0, 5),
    explorationCursor: signal.explorationCursor + 1
  };

  if (action.type === "connect" && action.profile) {
    next.connectedProfileIds = unique([...next.connectedProfileIds, action.profile.id]);
    next.skills = unique([...next.skills, ...action.profile.skills.slice(0, 2)]);
    next.goals = unique([...next.goals, ...action.profile.goals.slice(0, 1)]);
    next.industries = unique([...next.industries, ...action.profile.industries.slice(0, 1)]);
    next.mutualConnectionIds = unique([
      ...next.mutualConnectionIds,
      action.profile.id,
      ...action.profile.mutualConnectionIds.slice(0, 2)
    ]);
  }

  if (action.type === "rsvp" && action.event) {
    next.rsvpedEventIds = unique([...next.rsvpedEventIds, action.event.id]);
    next.skills = unique([...next.skills, ...action.event.topics.slice(0, 2)]);
    next.goals = unique([...next.goals, ...action.event.goals.slice(0, 1)]);
    next.industries = unique([...next.industries, ...action.event.industries.slice(0, 1)]);
    next.mutualConnectionIds = unique([
      ...next.mutualConnectionIds,
      ...action.event.hostConnectionIds.slice(0, 2)
    ]);
  }

  if (action.type === "dwell" && action.entityId) {
    next.dwellByEntityId[action.entityId] = (next.dwellByEntityId[action.entityId] ?? 0) + 1;
  }

  return next;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

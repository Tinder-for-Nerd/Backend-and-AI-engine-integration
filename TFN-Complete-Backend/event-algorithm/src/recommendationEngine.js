import { eventCatalog, profileCatalog } from "./data/recommendationData.js";
import { getEventWeights, rankEvents } from "./features/recommendations/scoreEvents.js";
import { getProfileWeights, rankProfiles } from "./features/recommendations/scoreProfiles.js";
import { createUserSignal, reduceSignalWithFeedback } from "./features/recommendations/userSignal.js";

const DEFAULT_SLOT_COUNT = 3;

export function getRecommendations({
  userType = "student",
  signal = createUserSignal(userType),
  profiles = profileCatalog,
  events = eventCatalog,
  slotCount = DEFAULT_SLOT_COUNT
} = {}) {
  const rankedProfiles = rankProfiles(profiles, signal);
  const rankedEvents = rankEvents(events, signal);

  return {
    userType: signal.userType,
    signal,
    weights: {
      profiles: getProfileWeights(signal.userType),
      events: getEventWeights(signal.userType)
    },
    profileCards: selectRankedSlots(rankedProfiles, signal.explorationCursor, slotCount),
    eventCards: selectRankedSlots(rankedEvents, signal.explorationCursor + 1, slotCount),
    explorationSlot: selectExplorationSlot(
      rankedProfiles,
      rankedEvents,
      signal.explorationCursor
    ),
    rankedProfiles,
    rankedEvents
  };
}

export function applyFeedback(signal, action) {
  return reduceSignalWithFeedback(signal, {
    occurredAt: action.occurredAt ?? new Date().toISOString(),
    ...action
  });
}

export function createRecommendationSession(userType = "student") {
  let signal = createUserSignal(userType);

  return {
    get signal() {
      return signal;
    },
    recommend(options = {}) {
      return getRecommendations({ ...options, signal });
    },
    feedback(action) {
      signal = applyFeedback(signal, action);
      return this.recommend();
    }
  };
}

function selectRankedSlots(items, cursor, slotCount) {
  if (slotCount <= 0) return [];
  if (items.length <= slotCount) {
    return items.map((item) => ({ ...item, slotType: "ranked" }));
  }

  const rankedCount = Math.max(slotCount - 1, 1);
  const topItems = items.slice(0, rankedCount).map((item) => ({ ...item, slotType: "ranked" }));
  const explorationPool = items.slice(rankedCount);
  const exploration = explorationPool[cursor % explorationPool.length];

  return [...topItems, { ...exploration, slotType: "exploration" }];
}

function selectExplorationSlot(profiles, events, cursor) {
  const pool = [
    ...profiles.slice(2).map((item) => ({ ...item, entityType: "profile" })),
    ...events.slice(2).map((item) => ({ ...item, entityType: "event" }))
  ];

  return pool[cursor % pool.length] ?? null;
}

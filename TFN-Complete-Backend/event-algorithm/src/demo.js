import { eventCatalog, profileCatalog } from "./data/recommendationData.js";
import { createRecommendationSession } from "./recommendationEngine.js";

function printRun(userType) {
  const session = createRecommendationSession(userType);
  const initial = session.recommend();

  console.log(`\n${userType.toUpperCase()} RECOMMENDATIONS`);
  console.log("Profile weights:", initial.weights.profiles);
  console.table(
    initial.profileCards.map((profile) => ({
      slot: profile.slotType,
      name: profile.name,
      score: Math.round(profile.score * 100),
      reason: profile.reasons[0]
    }))
  );
  console.table(
    initial.eventCards.map((event) => ({
      slot: event.slotType,
      event: event.title,
      score: Math.round(event.score * 100),
      reason: event.reasons[0]
    }))
  );

  const afterFeedback = session.feedback({
    type: userType === "student" ? "connect" : "rsvp",
    profile: profileCatalog[1],
    event: eventCatalog[1],
    occurredAt: "demo"
  });

  console.log("After feedback, exploration slot:");
  console.log(afterFeedback.explorationSlot?.title ?? afterFeedback.explorationSlot?.name);
}

printRun("student");
printRun("pro");

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { profileCatalog } from "../src/data/recommendationData.js";
import {
  applyFeedback,
  createRecommendationSession,
  getRecommendations
} from "../src/recommendationEngine.js";
import { createUserSignal } from "../src/features/recommendations/userSignal.js";

describe("ProMatch recommendation algorithm", () => {
  it("uses skill overlap as the strongest student profile weight", () => {
    const recommendations = getRecommendations({ userType: "student" });

    assert.equal(recommendations.weights.profiles.skillOverlap, 0.5);
    assert.equal(recommendations.profileCards.length, 3);
    assert.equal(recommendations.eventCards.length, 3);
    assert.ok(recommendations.explorationSlot);
  });

  it("uses mutual connections as the strongest pro profile weight", () => {
    const recommendations = getRecommendations({ userType: "pro" });

    assert.equal(recommendations.weights.profiles.mutualConnections, 0.4);
    assert.equal(recommendations.profileCards.length, 3);
    assert.equal(recommendations.eventCards.length, 3);
  });

  it("updates signal from feedback and re-ranks through the same engine", () => {
    const signal = createUserSignal("student");
    const connectedProfile = profileCatalog.find((profile) => profile.id === "arjun-mehta");
    const updatedSignal = applyFeedback(signal, {
      type: "connect",
      profile: connectedProfile,
      occurredAt: "test"
    });
    const recommendations = getRecommendations({ signal: updatedSignal });

    assert.ok(updatedSignal.connectedProfileIds.includes("arjun-mehta"));
    assert.ok(updatedSignal.mutualConnectionIds.includes("arjun-mehta"));
    assert.equal(recommendations.signal.recentActions[0].type, "connect");
  });

  it("keeps a mutable session API for repeated feedback loops", () => {
    const session = createRecommendationSession("pro");
    const before = session.recommend().signal.explorationCursor;

    session.feedback({ type: "dwell", entityId: "ai-build-night", occurredAt: "test" });

    assert.equal(session.signal.explorationCursor, before + 1);
  });
});

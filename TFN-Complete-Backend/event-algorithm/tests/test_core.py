import unittest

from skillscore_algorithm.core import (
    DomainDefinition,
    ScoringConfig,
    SkillEvidence,
    SkillTaxonomyEntry,
    aggregate_domain_score,
    complementarity_score,
    extract_exact_skill_mentions,
    final_match_score,
    score_skill,
)


class SkillScoreTests(unittest.TestCase):
    def test_skill_score_blends_algorithmic_and_self_reported_signals(self) -> None:
        config = ScoringConfig(w1=0.25, w2=0.25, w3=0.25, w4=0.25)
        evidence = SkillEvidence(
            name="React",
            domain="Frontend",
            months_since_use=0,
            role_months=60,
            seniority_level="expert",
            endorsement_count=50,
            self_reported_level="expert",
        )

        score = score_skill(evidence, config)

        self.assertGreater(score.final_score, 0.8)
        self.assertFalse(score.stale)

    def test_stale_flag_triggers_after_three_tau(self) -> None:
        evidence = SkillEvidence(
            name="Python",
            domain="Backend",
            months_since_use=80,
            role_months=12,
        )

        score = score_skill(evidence, ScoringConfig(tau_months=24))

        self.assertTrue(score.stale)

    def test_exact_taxonomy_matching_is_confidence_gated(self) -> None:
        taxonomy = (
            SkillTaxonomyEntry(canonical_name="React", domain="Frontend", aliases=("React.js",)),
            SkillTaxonomyEntry(canonical_name="Vue", domain="Frontend", aliases=("Vue.js",)),
        )

        matches = extract_exact_skill_mentions("I worked with React and Vue.js.", taxonomy)

        self.assertEqual({match.canonical_name for match in matches}, {"React", "Vue"})
        self.assertTrue(all(match.confidence >= 0.95 for match in matches))

    def test_domain_aggregation_applies_coverage_bonus(self) -> None:
        domain = DomainDefinition(name="Frontend", key_skills=("React", "Vue", "TypeScript"))
        score = aggregate_domain_score(
            {"React": 0.9, "Vue": 0.7},
            domain,
            ScoringConfig(coverage_k=0.3),
        )

        self.assertGreater(score, 0.7)

    def test_complementarity_scores_missing_coverage(self) -> None:
        source_vector = {"Frontend": 0.9, "Backend": 0.2}
        target_vector = {"Frontend": 0.4, "Backend": 0.8, "Product": 0.6}

        self.assertAlmostEqual(complementarity_score(source_vector, target_vector), 1.2)

    def test_cold_start_profiles_do_not_get_match_scores(self) -> None:
        result = final_match_score(
            {"Frontend": 0.8},
            {"Frontend": 0.5},
            scored_skill_count=2,
        )

        self.assertIsNone(result.final_score)
        self.assertIsNotNone(result.reason)


if __name__ == "__main__":
    unittest.main()

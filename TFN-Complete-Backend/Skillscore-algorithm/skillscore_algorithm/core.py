from __future__ import annotations

from dataclasses import dataclass
from math import exp, log, log1p, sqrt
import re
from typing import Mapping, Sequence
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Optional


@dataclass(frozen=True)
class ScoringConfig:
	w1: float = 0.35
	w2: float = 0.25
	w3: float = 0.20
	w4: float = 0.20
	tau_months: float = 24.0
	coverage_k: float = 0.30
	alpha: float = 0.40
	beta: float = 0.60
	min_confidence_threshold: float = 0.60
	min_scored_skills_for_match: int = 3
	duration_normalizer_months: float = 60.0


@dataclass(frozen=True)
class SkillTaxonomyEntry:
	canonical_name: str
	domain: str
	aliases: tuple[str, ...] = ()
	version: int = 1


@dataclass(frozen=True)
class ExtractedSkill:
	canonical_name: str
	domain: str
	confidence: float
	matched_text: str
	match_type: str


@dataclass(frozen=True)
class SkillEvidence:
	name: str
	domain: str
	months_since_use: float
	role_months: float
	seniority_level: str = "used"
	endorsement_count: int = 0
	self_reported_level: str | float = "Intermediate"
	extraction_confidence: float = 1.0


@dataclass(frozen=True)
class SkillScore:
	name: str
	domain: str
	recency_score: float
	duration_score: float
	seniority_score: float
	endorsement_score: float
	algorithmic_score: float
	self_reported_score: float
	final_score: float
	stale: bool = False


@dataclass(frozen=True)
class DomainDefinition:
	name: str
	key_skills: tuple[str, ...]
	version: int = 1


@dataclass(frozen=True)
class MatchResult:
	similarity_score: float | None
	complementarity_score: float | None
	final_score: float | None
	reason: str | None = None


_SENIORITY_MAP = {
	"used": 0.25,
	"built": 0.50,
	"led": 0.75,
	"expert": 1.00,
}

_SELF_REPORTED_MAP = {
	"beginner": 0.25,
	"intermediate": 0.50,
	"advanced": 0.75,
	"expert": 1.00,
}


def _bounded(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
	return max(lower, min(upper, value))


def _normalize_self_reported_level(self_reported_level: str | float) -> float:
	if isinstance(self_reported_level, (int, float)):
		return _bounded(float(self_reported_level))
	return _SELF_REPORTED_MAP.get(self_reported_level.strip().lower(), 0.5)


def _seniority_score(seniority_level: str) -> float:
	return _SENIORITY_MAP.get(seniority_level.strip().lower(), 0.25)


def recency_score(months_since_use: float, tau_months: float) -> tuple[float, bool]:
	months_since_use = max(0.0, months_since_use)
	tau_months = max(1e-9, tau_months)
	score = exp(-months_since_use / tau_months)
	stale = months_since_use > 3 * tau_months
	return score, stale


def duration_score(role_months: float, duration_normalizer_months: float) -> float:
	role_months = max(0.0, role_months)
	duration_normalizer_months = max(1.0, duration_normalizer_months)
	return _bounded(log1p(role_months) / log1p(duration_normalizer_months))


def endorsement_score(endorsement_count: int) -> float:
	endorsement_count = max(0, endorsement_count)
	return min(log(endorsement_count + 1) / log(50), 0.15)


def score_skill(evidence: SkillEvidence, config: ScoringConfig | None = None) -> SkillScore:
	config = config or ScoringConfig()

	recency, stale = recency_score(evidence.months_since_use, config.tau_months)
	duration = duration_score(evidence.role_months, config.duration_normalizer_months)
	seniority = _seniority_score(evidence.seniority_level)
	endorsements = endorsement_score(evidence.endorsement_count)
	self_reported = _normalize_self_reported_level(evidence.self_reported_level)

	algorithmic = (
		config.w1 * recency
		+ config.w2 * duration
		+ config.w3 * seniority
		+ config.w4 * endorsements
	)
	final = 0.7 * algorithmic + 0.3 * self_reported

	return SkillScore(
		name=evidence.name,
		domain=evidence.domain,
		recency_score=recency,
		duration_score=duration,
		seniority_score=seniority,
		endorsement_score=endorsements,
		algorithmic_score=algorithmic,
		self_reported_score=self_reported,
		final_score=final,
		stale=stale,
	)


def extract_exact_skill_mentions(
	text: str,
	taxonomy: Sequence[SkillTaxonomyEntry],
	confidence_threshold: float = 0.0,
) -> list[ExtractedSkill]:
	matches: list[ExtractedSkill] = []
	seen: set[str] = set()
	normalized_text = text.lower()

	candidate_terms: list[tuple[str, SkillTaxonomyEntry]] = []
	for entry in taxonomy:
		candidate_terms.append((entry.canonical_name, entry))
		for alias in entry.aliases:
			candidate_terms.append((alias, entry))

	candidate_terms.sort(key=lambda item: len(item[0]), reverse=True)

	for term, entry in candidate_terms:
		pattern = re.compile(rf"(?<!\w){re.escape(term.lower())}(?!\w)", re.IGNORECASE)
		if entry.canonical_name in seen:
			continue
		match = pattern.search(normalized_text)
		if match and 0.95 >= confidence_threshold:
			matches.append(
				ExtractedSkill(
					canonical_name=entry.canonical_name,
					domain=entry.domain,
					confidence=0.95,
					matched_text=match.group(0),
					match_type="exact",
				)
			)
			seen.add(entry.canonical_name)

	return matches


def aggregate_domain_score(
	skill_scores: Mapping[str, float],
	domain_definition: DomainDefinition,
	config: ScoringConfig | None = None,
) -> float:
	config = config or ScoringConfig()
	covered_scores = [skill_scores[skill_name] for skill_name in domain_definition.key_skills if skill_name in skill_scores]
	if not covered_scores:
		return 0.0

	base_score = sum(covered_scores) / len(covered_scores)
	coverage_ratio = len(covered_scores) / max(1, len(domain_definition.key_skills))
	coverage_bonus = 1 + (config.coverage_k * coverage_ratio)
	return base_score * coverage_bonus


def cosine_similarity(left: Mapping[str, float], right: Mapping[str, float]) -> float:
	shared_keys = set(left) | set(right)
	if not shared_keys:
		return 0.0

	dot_product = sum(left.get(key, 0.0) * right.get(key, 0.0) for key in shared_keys)
	left_norm = sqrt(sum(value * value for value in left.values()))
	right_norm = sqrt(sum(value * value for value in right.values()))
	if left_norm == 0.0 or right_norm == 0.0:
		return 0.0
	return dot_product / (left_norm * right_norm)


def complementarity_score(
	source_vector: Mapping[str, float],
	target_vector: Mapping[str, float],
) -> float:
	all_keys = set(source_vector) | set(target_vector)
	return sum(max(0.0, target_vector.get(key, 0.0) - source_vector.get(key, 0.0)) for key in all_keys)


def final_match_score(
	source_vector: Mapping[str, float],
	target_vector: Mapping[str, float],
	scored_skill_count: int,
	config: ScoringConfig | None = None,
) -> MatchResult:
	config = config or ScoringConfig()

	if scored_skill_count < config.min_scored_skills_for_match:
		return MatchResult(
			similarity_score=None,
			complementarity_score=None,
			final_score=None,
			reason="Complete your profile to see your match score.",
		)

	similarity = cosine_similarity(source_vector, target_vector)
	complementarity = complementarity_score(source_vector, target_vector)
	final = config.alpha * similarity + config.beta * complementarity

	return MatchResult(
		similarity_score=similarity,
		complementarity_score=complementarity,
		final_score=final,
	)


@dataclass(frozen=True)
class Event:
	id: str
	title: str
	required_skills: Mapping[str, float]
	start_time: Optional[str] = None  # ISO8601 string
	popularity: float = 0.5
	location: Optional[str] = None
	metadata: Mapping[str, object] | None = None


@dataclass(frozen=True)
class DomainProfile:
	domain_scores: Mapping[str, float]
	top_domain: str | None
	weighted_skill_vector: Mapping[str, float]
	total_skill_score: float


def _event_recency_score(start_time_iso: Optional[str]) -> float:
	"""Compute a recency score R in [0,1] based on days until start.

	Recent upcoming events get values near 1. If start_time is missing or unparsable,
	returns 0.5 as a neutral value.
	"""
	if not start_time_iso:
		return 0.5
	try:
		dt = datetime.fromisoformat(start_time_iso)
		if dt.tzinfo is None:
			dt = dt.replace(tzinfo=timezone.utc)
		now = datetime.now(timezone.utc)
		delta = (dt - now).days
		# If event already happened, small score
		if delta < 0:
			return 0.1
		# Decay over ~90 days window
		return _bounded(exp(-delta / 30.0))
	except Exception:
		return 0.5


def score_event_for_user(
	user_skill_scores: Mapping[str, float],
	event: Event,
	config: ScoringConfig | None = None,
) -> dict:
	"""Score an event for a user given their skill scores.

	Returns a dict with detailed components and `final_score`.
	"""
	config = config or ScoringConfig()

	# Direct coverage: how much of the event's required skills the user can satisfy
	eps = 1e-9
	numerator = sum(user_skill_scores.get(s, 0.0) * w for s, w in event.required_skills.items())
	user_total = sum(user_skill_scores.values()) + eps
	required_total = sum(event.required_skills.values()) + eps
	overlap = numerator / user_total if user_total > eps else 0.0
	coverage = numerator / required_total if required_total > eps else 0.0
	similarity = cosine_similarity(user_skill_scores, event.required_skills)

	# Complementarity is tracked for diagnostics, but it should not dominate event ranking.
	complement = complementarity_score(user_skill_scores, event.required_skills)

	# Recency and popularity
	recency = _event_recency_score(event.start_time)
	popularity = _bounded(float(event.popularity)) if event.popularity is not None else 0.0

	final = (
		0.55 * coverage
		+ 0.25 * similarity
		+ 0.10 * recency
		+ 0.10 * popularity
	)

	return {
		"event_id": event.id,
		"title": event.title,
		"overlap": overlap,
		"coverage": coverage,
		"similarity": similarity,
		"complementarity": complement,
		"recency": recency,
		"popularity": popularity,
		"final_score": final,
	}


def build_domain_profile(scored_skills: Sequence[SkillScore]) -> DomainProfile:
	"""Build a domain-weighted profile from every detected skill.

	Each domain gets a percentage score. The highest domains get more influence in the
	final weighted skill vector, so event ranking reflects the user's strongest area.
	"""
	if not scored_skills:
		return DomainProfile(domain_scores={}, top_domain=None, weighted_skill_vector={}, total_skill_score=0.0)

	raw_domain_totals: dict[str, float] = {}
	for skill in scored_skills:
		raw_domain_totals[skill.domain] = raw_domain_totals.get(skill.domain, 0.0) + max(0.0, skill.final_score)

	total = sum(raw_domain_totals.values())
	if total <= 0.0:
		weighted_skill_vector = {skill.name: skill.final_score for skill in scored_skills}
		return DomainProfile(
			domain_scores={domain: 0.0 for domain in raw_domain_totals},
			top_domain=max(raw_domain_totals, key=raw_domain_totals.get) if raw_domain_totals else None,
			weighted_skill_vector=weighted_skill_vector,
			total_skill_score=0.0,
		)

	domain_scores = {domain: score / total for domain, score in raw_domain_totals.items()}
	top_domain = max(domain_scores, key=domain_scores.get) if domain_scores else None

	weighted_skill_vector: dict[str, float] = {}
	for skill in scored_skills:
		domain_weight = domain_scores.get(skill.domain, 0.0)
		weighted_skill_vector[skill.name] = skill.final_score * (1.0 + domain_weight)

	return DomainProfile(
		domain_scores=domain_scores,
		top_domain=top_domain,
		weighted_skill_vector=weighted_skill_vector,
		total_skill_score=sum(skill.final_score for skill in scored_skills) / len(scored_skills),
	)


def rank_events_from_scored_skills(
	scored_skills: Sequence[SkillScore],
	events: Sequence[Event],
	config: ScoringConfig | None = None,
) -> tuple[DomainProfile, list[dict]]:
	"""Convert skill score results into the event-search input and rank events.

	This is the explicit bridge between the resume skill scoring output and the event
	matching algorithm.
	"""
	config = config or ScoringConfig()
	profile = build_domain_profile(scored_skills)
	ranked_events = [score_event_for_user(profile.weighted_skill_vector, event, config) for event in events]
	ranked_events.sort(key=lambda item: item.get("final_score", 0.0), reverse=True)
	return profile, ranked_events


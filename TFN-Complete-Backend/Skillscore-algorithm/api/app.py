from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import List, Dict, Any
from pathlib import Path
import json
import subprocess
from skillscore_algorithm.core import (
    SkillEvidence,
    ScoringConfig,
    score_skill,
    aggregate_domain_score,
    DomainDefinition,
    SkillTaxonomyEntry,
    extract_exact_skill_mentions,
    Event,
    score_event_for_user,
    build_domain_profile,
    rank_events_from_scored_skills,
)
import io
try:
    import PyPDF2
except Exception:
    PyPDF2 = None


app = FastAPI(title="Skillscore Algorithm API")
BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_TAXONOMY_PATH = BASE_DIR / "data" / "master_taxonomy.json"
DEFAULT_EVENTS_PATH = BASE_DIR / "data" / "sample_events.json"


def _normalize_form_text(value: str | None) -> str:
    text = (value or "").strip()
    if text.lower() in {"", "string", "null", "none"}:
        return ""
    return text


def _load_taxonomy_entries(taxonomy: str | None) -> List[SkillTaxonomyEntry]:
    raw_text = _normalize_form_text(taxonomy)
    if not raw_text:
        raw_text = DEFAULT_TAXONOMY_PATH.read_text(encoding="utf-8")

    try:
        parsed = json.loads(raw_text)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid taxonomy JSON: {e}")

    taxonomy_entries: List[SkillTaxonomyEntry] = []
    for item in parsed:
        canonical_name = item.get("canonical_name") or item.get("name")
        if not canonical_name:
            continue
        taxonomy_entries.append(
            SkillTaxonomyEntry(
                canonical_name=canonical_name,
                domain=item.get("domain") or canonical_name,
                aliases=tuple(item.get("aliases", [])),
            )
        )
    return taxonomy_entries


def _load_event_dicts(events: str | None) -> List[Dict[str, Any]]:
    raw_text = _normalize_form_text(events)
    if not raw_text:
        raw_text = DEFAULT_EVENTS_PATH.read_text(encoding="utf-8")

    try:
        parsed = json.loads(raw_text)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid events JSON: {e}")

    if not isinstance(parsed, list):
        raise HTTPException(status_code=400, detail="Invalid events JSON: expected a list of event objects")

    event_dicts: List[Dict[str, Any]] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        if not item.get("id") or not item.get("title") or not item.get("required_skills"):
            continue
        event_dicts.append(item)
    return event_dicts


class SkillInput(BaseModel):
    name: str
    domain: str
    months_since_use: float
    role_months: float
    seniority_level: str = "used"
    endorsement_count: int = 0
    self_reported_level: str | float = "Intermediate"


class CombineRequest(BaseModel):
    skills: List[SkillInput]
    domain_key_skills: Dict[str, List[str]] = {}
    node_options: Dict[str, Any] = {}


class EventInput(BaseModel):
    id: str
    title: str
    required_skills: Dict[str, float]
    start_time: str | None = None
    popularity: float | None = 0.5


class SearchEventsRequest(BaseModel):
    skills: List[SkillInput]
    events: List[EventInput]
    top_k: int = 10


class UploadEventInput(BaseModel):
    id: str
    title: str
    required_skills: Dict[str, float]
    start_time: str | None = None
    popularity: float | None = 0.5


@app.get("/", response_class=HTMLResponse)
def home_page() -> HTMLResponse:
        return HTMLResponse(
                """
                <html>
                    <head>
                        <title>Skillscore FastAPI Demo</title>
                        <style>
                            body { font-family: Arial, sans-serif; max-width: 860px; margin: 40px auto; line-height: 1.5; padding: 0 16px; }
                            .card { border: 1px solid #d7dbe3; border-radius: 14px; padding: 20px; box-shadow: 0 8px 24px rgba(0,0,0,0.04); }
                            textarea, input[type="file"] { width: 100%; box-sizing: border-box; }
                            textarea { min-height: 120px; font-family: Consolas, monospace; }
                            button { padding: 10px 16px; border: 0; border-radius: 10px; background: #111827; color: #fff; cursor: pointer; }
                            pre { white-space: pre-wrap; word-break: break-word; background: #0b1020; color: #d1e7ff; padding: 16px; border-radius: 12px; overflow-x: auto; }
                            .muted { color: #5b6475; }
                            .row { display: grid; grid-template-columns: 1fr; gap: 14px; }
                        </style>
                    </head>
                    <body>
                        <div class="card">
                            <h1>Skillscore FastAPI Demo</h1>
                            <p class="muted">Upload a resume PDF or text file. The API uses the built-in taxonomy and sample events automatically, and the result appears below.</p>
                            <form id="upload-form">
                                <div class="row">
                                    <label>
                                        Resume file
                                        <input type="file" name="file" accept=".pdf,.txt" required>
                                    </label>
                                    <label>
                                        Optional events JSON
                                        <textarea name="events" placeholder='Leave blank to use the built-in sample events'></textarea>
                                    </label>
                                    <label>
                                        Optional taxonomy JSON
                                        <textarea name="taxonomy" placeholder='Leave blank to use the built-in taxonomy'></textarea>
                                    </label>
                                    <div>
                                        <button type="submit">Upload and Score</button>
                                    </div>
                                </div>
                            </form>
                        </div>

                        <div class="card" style="margin-top: 20px;">
                            <h2>Result</h2>
                            <pre id="output">Upload a file to see the result here.</pre>
                        </div>

                        <script>
                            const form = document.getElementById('upload-form');
                            const output = document.getElementById('output');

                            form.addEventListener('submit', async (event) => {
                                event.preventDefault();
                                output.textContent = 'Uploading...';

                                const formData = new FormData(form);
                                const response = await fetch('/upload_and_score', {
                                    method: 'POST',
                                    body: formData,
                                });

                                let payload;
                                try {
                                    payload = await response.json();
                                } catch (error) {
                                    output.textContent = 'Could not parse response: ' + error;
                                    return;
                                }

                                if (!response.ok) {
                                    output.textContent = JSON.stringify(payload, null, 2);
                                    return;
                                }

                                output.textContent = JSON.stringify(payload, null, 2);
                            });
                        </script>
                    </body>
                </html>
                """
        )


@app.post("/score_skill")
def api_score_skill(skill: SkillInput):
    evidence = SkillEvidence(
        name=skill.name,
        domain=skill.domain,
        months_since_use=skill.months_since_use,
        role_months=skill.role_months,
        seniority_level=skill.seniority_level,
        endorsement_count=skill.endorsement_count,
        self_reported_level=skill.self_reported_level,
    )
    scored = score_skill(evidence, ScoringConfig())
    return scored.__dict__


@app.post("/combine")
def api_combine(req: CombineRequest):
    # Score each skill
    scored = [score_skill(SkillEvidence(**s.dict()), ScoringConfig()) for s in req.skills]

    # Build domain vectors and aggregate
    domain_scores: Dict[str, float] = {}
    for domain_name, keys in req.domain_key_skills.items():
        skill_map = {s.name: s.final_score for s in scored if s.domain == domain_name}
        domain_scores[domain_name] = aggregate_domain_score(skill_map, DomainDefinition(name=domain_name, key_skills=tuple(keys)))

    # Call node recommendation engine
    try:
        options_json = json.dumps(req.node_options or {})
        cmd = f"node tools/run_recommendation.js '{options_json}'"
        process = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        if process.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Node runner failed: {process.stderr}")
        node_result = json.loads(process.stdout)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "domain_scores": domain_scores,
        "node_recommendations": node_result,
    }


@app.post("/upload_and_score")
async def upload_and_score(
    file: UploadFile = File(...),
    taxonomy: str | None = Form(None),
    events: str | None = Form(None),
    role_months: float = Form(12.0),
    months_since_use: float = Form(1.0),
    seniority_level: str = Form("used"),
    endorsement_count: int = Form(0),
    self_reported_level: str | float = Form("Intermediate"),
):
    """Upload a resume/text or PDF and score detected skills.

    - `taxonomy` is an optional JSON string array of objects: {canonical_name, domain, aliases}
    """
    content = None
    try:
        data = await file.read()
        fname = (file.filename or "").lower()
        if fname.endswith(".pdf") and PyPDF2 is not None:
            reader = PyPDF2.PdfReader(io.BytesIO(data))
            texts = [p.extract_text() or "" for p in reader.pages]
            content = "\n".join(texts)
        else:
            # assume plain text
            content = data.decode("utf-8", errors="ignore")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read uploaded file: {e}")

    taxonomy_entries = _load_taxonomy_entries(taxonomy)

    if not taxonomy_entries:
        raise HTTPException(status_code=400, detail="No valid taxonomy entries found")

    extracted = extract_exact_skill_mentions(content, taxonomy_entries)

    results = []
    scored_skills = []
    for ex in extracted:
        evidence = SkillEvidence(
            name=ex.canonical_name,
            domain=ex.domain,
            months_since_use=months_since_use,
            role_months=role_months,
            seniority_level=seniority_level,
            endorsement_count=endorsement_count,
            self_reported_level=self_reported_level,
        )
        scored = score_skill(evidence, ScoringConfig())
        scored_skills.append(scored)
        results.append({"extracted": ex.__dict__, "score": scored.__dict__})

    event_dicts = _load_event_dicts(events)
    event_objects = [
        Event(
            id=item["id"],
            title=item["title"],
            required_skills=item["required_skills"],
            start_time=item.get("start_time"),
            popularity=item.get("popularity", 0.5),
        )
        for item in event_dicts
    ]
    profile, ranked_events = rank_events_from_scored_skills(scored_skills, event_objects, ScoringConfig())

    return {
        "file": file.filename,
        "pdf_name": file.filename,
        "file_name": file.filename,
        "skill_score_results": results,
        "results": results,
        "domain_scores": profile.domain_scores,
        "top_domain": profile.top_domain,
        "total_skill_score": profile.total_skill_score,
        "weighted_skill_vector": profile.weighted_skill_vector,
        "event_search_vector": profile.weighted_skill_vector,
        "ranked_events": ranked_events,
        "used_default_taxonomy": not bool(_normalize_form_text(taxonomy)),
        "used_default_events": not bool(_normalize_form_text(events)),
    }


@app.post("/search_events")
def search_events(req: SearchEventsRequest):
    # Build user skill scores
    scored = [score_skill(SkillEvidence(**s.model_dump()), ScoringConfig()) for s in req.skills]
    event_objects = [
        Event(id=ev.id, title=ev.title, required_skills=ev.required_skills, start_time=ev.start_time, popularity=ev.popularity or 0.5)
        for ev in req.events
    ]
    profile, scored_events = rank_events_from_scored_skills(scored, event_objects, ScoringConfig())
    return {
        "top_k": req.top_k,
        "domain_scores": profile.domain_scores,
        "top_domain": profile.top_domain,
        "total_skill_score": profile.total_skill_score,
        "event_search_vector": profile.weighted_skill_vector,
        "results": scored_events[: req.top_k],
    }

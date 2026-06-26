"""Skillscore algorithm testing page."""
import json

import streamlit as st

from lib.config import SKILLSCORE_URL
from lib.http_client import request
from lib.skillscore_local import score_resume_local
from lib.state import get_log, init_state

init_state()
log = get_log()

st.title("🎯 Skillscore & Event Ranking")
st.caption("Resume skill extraction, scoring, and event recommendations")

mode = st.radio(
    "Scoring mode",
    ["API (remote)", "Local (direct Python)"],
    horizontal=True,
    help="Local mode runs skillscore_algorithm directly without starting the API.",
)

uploaded = st.file_uploader("Upload resume (PDF or text)", type=["pdf", "txt"])

c1, c2, c3 = st.columns(3)
with c1:
    role_months = st.number_input("Role months", value=12.0, min_value=0.0)
with c2:
    months_since_use = st.number_input("Months since use", value=1.0, min_value=0.0)
with c3:
    seniority = st.selectbox("Seniority", ["used", "primary", "expert"])

if st.button("Score Resume", type="primary", disabled=not uploaded):
    if not uploaded:
        st.warning("Upload a file first.")
    else:
        content = uploaded.read()
        with st.spinner("Scoring…"):
            if mode.startswith("API"):
                files = {"file": (uploaded.name, content, uploaded.type or "application/octet-stream")}
                data = {
                    "role_months": str(role_months),
                    "months_since_use": str(months_since_use),
                    "seniority_level": seniority,
                }
                res = request(
                    "POST",
                    SKILLSCORE_URL,
                    "/upload_and_score",
                    data=data,
                    files=files,
                    timeout=60.0,
                    log=log,
                )
                if res.ok:
                    result = res.data
                else:
                    st.error(f"API error ({res.status}): {res.data}")
                    st.stop()
            else:
                result = score_resume_local(
                    content,
                    uploaded.name,
                    role_months=role_months,
                    months_since_use=months_since_use,
                    seniority_level=seniority,
                )

        st.success(f"Scored **{uploaded.name}**")

        m1, m2, m3 = st.columns(3)
        with m1:
            st.metric("Top Domain", result.get("top_domain", "—"))
        with m2:
            st.metric("Total Skill Score", f"{result.get('total_skill_score', 0):.2f}")
        with m3:
            skills = result.get("skill_score_results", result.get("results", []))
            st.metric("Skills Found", len(skills))

        st.subheader("Domain Scores")
        domain_scores = result.get("domain_scores", {})
        if domain_scores:
            st.bar_chart(domain_scores)

        st.subheader("Ranked Events")
        events = result.get("ranked_events", [])
        if events:
            for ev in events[:10]:
                if isinstance(ev, dict):
                    title = ev.get("title", ev.get("event", {}).get("title", "?"))
                    score = ev.get("score", ev.get("final_score", 0))
                else:
                    title = getattr(ev, "title", str(ev))
                    score = getattr(ev, "score", 0)
                st.markdown(f"- **{title}** — score `{score:.3f}`" if isinstance(score, float) else f"- **{title}**")
        else:
            st.caption("No ranked events returned.")

        with st.expander("Full JSON response"):
            st.json(result)

st.divider()
st.subheader("Manual Skill Search")
st.caption("POST /search_events with custom skills and events JSON")

skills_json = st.text_area(
    "Skills JSON",
    value=json.dumps(
        [
            {
                "name": "Python",
                "domain": "Software Engineering",
                "months_since_use": 1,
                "role_months": 24,
                "seniority_level": "primary",
            }
        ],
        indent=2,
    ),
    height=120,
)
events_json = st.text_area("Events JSON (optional — uses sample if empty)", value="", height=80)

if st.button("Search Events"):
    try:
        skills = json.loads(skills_json)
        body: dict = {"skills": skills, "events": [], "top_k": 10}
        if events_json.strip():
            body["events"] = json.loads(events_json)

        if mode.startswith("Local"):
            st.info("Manual search requires API mode or extend local module.")
        else:
            res = request("POST", SKILLSCORE_URL, "/search_events", json_body=body, log=log)
            if res.ok:
                st.json(res.data)
            else:
                st.error(res.data)
    except json.JSONDecodeError as exc:
        st.error(f"Invalid JSON: {exc}")

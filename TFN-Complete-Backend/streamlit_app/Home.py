"""TFN Platform — unified testing dashboard."""
import streamlit as st

from lib.config import AUTH_URL, PROMATCH_URL, SKILLSCORE_URL
from lib.http_client import request
from lib.state import get_log, get_manager, init_state

st.set_page_config(
    page_title="TFN Platform Tester",
    page_icon="🔗",
    layout="wide",
    initial_sidebar_state="expanded",
)

init_state()
log = get_log()
manager = get_manager()

st.title("🔗 TFN Complete Backend — Testing Platform")
st.caption("Unified interface for ProMatch, Auth-Security, and Skillscore services")

# ── Network diagram ─────────────────────────────────────────────────────
st.subheader("Service Network")
st.markdown(
    """
```mermaid
flowchart LR
    UI[Streamlit UI] --> PM[ProMatch API :8002]
    UI --> AUTH[Auth-Security :8000]
    UI --> SS[Skillscore API :8003]
    PM --> SB[(Supabase)]
    PM --> RD1[(Redis)]
    AUTH --> SQLITE[(SQLite)]
    AUTH --> RD2[(Redis)]
    SS --> TAX[Taxonomy + Events]
    SS --> NODE[Node.js Engine]
```
"""
)

col_cfg1, col_cfg2, col_cfg3 = st.columns(3)
with col_cfg1:
    st.text_input("ProMatch URL", value=PROMATCH_URL, disabled=True, key="pm_url_display")
with col_cfg2:
    st.text_input("Auth URL", value=AUTH_URL, disabled=True, key="auth_url_display")
with col_cfg3:
    st.text_input("Skillscore URL", value=SKILLSCORE_URL, disabled=True, key="ss_url_display")

# ── Service health ──────────────────────────────────────────────────────
st.subheader("Live Service Status")
if st.button("🔄 Refresh All Health Checks", type="primary"):
    st.rerun()

status = manager.status()
cols = st.columns(3)
icons = {"promatch": "💼", "auth": "🔐", "skillscore": "🎯"}

for i, (key, info) in enumerate(status.items()):
    with cols[i]:
        http_ok = info["http_ok"]
        proc_ok = info["process"]
        badge = "🟢 Online" if http_ok else ("🟡 Process only" if proc_ok else "🔴 Offline")
        st.metric(label=f"{icons[key]} {info['name']}", value=badge)
        st.caption(f"{info['url']}")
        if info["pid"]:
            st.caption(f"PID: {info['pid']}")
        if info["error"]:
            st.caption(f"Error: {info['error']}")

# ── Quick service controls ──────────────────────────────────────────────
st.subheader("Background Service Manager")
st.info(
    "Start all backend APIs from here, or use the **Service Manager** page for per-service control. "
    "Ensure Redis is running for ProMatch and Auth-Security."
)

c1, c2, c3 = st.columns(3)
with c1:
    if st.button("▶ Start All Services"):
        for msg in manager.start_all():
            st.write(msg)
        st.rerun()
with c2:
    if st.button("⏹ Stop All Services"):
        for msg in manager.stop_all():
            st.write(msg)
        st.rerun()
with c3:
    if st.button("🔁 Restart All"):
        manager.stop_all()
        for msg in manager.start_all():
            st.write(msg)
        st.rerun()

# ── Deep health for ProMatch ────────────────────────────────────────────
st.subheader("ProMatch Deep Health")
hc1, hc2, hc3, hc4 = st.columns(4)

h_health = request("GET", PROMATCH_URL, "/healthz", log=log)
h_ready = request("GET", PROMATCH_URL, "/readyz", log=log)
h_version = request("GET", PROMATCH_URL, "/version", log=log)

with hc1:
    st.metric("API", "OK" if h_health.ok else "DOWN")
with hc2:
    db_ok = h_ready.data.get("checks", {}).get("db") == "ok" if h_ready.ok else False
    st.metric("Database", "OK" if db_ok else "—")
with hc3:
    redis_ok = h_ready.data.get("checks", {}).get("redis") == "ok" if h_ready.ok else False
    st.metric("Redis", "OK" if redis_ok else "—")
with hc4:
    sha = h_version.data.get("git_sha", "—") if h_version.ok else "—"
    st.metric("Git SHA", sha[:8] if isinstance(sha, str) and len(sha) > 8 else sha)

# ── Request log ─────────────────────────────────────────────────────────
st.subheader("Recent API Calls")
if st.button("Clear Log"):
    log.entries.clear()
    st.rerun()

if log.entries:
    st.dataframe(log.entries, use_container_width=True, hide_index=True)
else:
    st.caption("No API calls yet — use the sidebar pages to test endpoints.")

st.divider()
st.markdown(
    """
**Quick start**
1. Open **Service Manager** → start backends (or run them manually).
2. **Auth & Security** → register/login to get JWT tokens.
3. **ProMatch** → paste Supabase JWTs for User A/B, test discovery & matches.
4. **Skillscore** → upload a resume PDF to score skills and rank events.
"""
)

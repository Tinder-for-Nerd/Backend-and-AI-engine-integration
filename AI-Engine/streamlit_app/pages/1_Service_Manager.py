"""Background service manager page."""
import streamlit as st

from lib.service_manager import SERVICES
from lib.state import get_manager, init_state

init_state()
manager = get_manager()

st.title("⚙️ Service Manager")
st.caption("Start and stop TFN backend services as background processes")

for key, spec in SERVICES.items():
    with st.expander(f"**{spec.name}** — `{spec.url}`", expanded=True):
        running = manager.is_running(key)
        st.code(" ".join(spec.command), language="bash")
        st.caption(f"Working directory: `{spec.cwd}`")

        c1, c2, c3 = st.columns(3)
        with c1:
            if st.button(f"▶ Start", key=f"start_{key}"):
                ok, msg = manager.start(key)
                st.success(msg) if ok else st.error(msg)
                st.rerun()
        with c2:
            if st.button(f"⏹ Stop", key=f"stop_{key}"):
                _, msg = manager.stop(key)
                st.info(msg)
                st.rerun()
        with c3:
            status = "🟢 Running" if running else "🔴 Stopped"
            st.metric("Status", status)

st.divider()
st.subheader("Bulk Actions")
b1, b2 = st.columns(2)
with b1:
    if st.button("▶ Start All Services", type="primary", use_container_width=True):
        for msg in manager.start_all():
            st.write(msg)
        st.rerun()
with b2:
    if st.button("⏹ Stop All Services", use_container_width=True):
        for msg in manager.stop_all():
            st.write(msg)
        st.rerun()

st.subheader("Prerequisites")
st.markdown(
    """
| Service | Requires |
|---------|----------|
| **ProMatch** | Supabase (`.env` in `TFN_backend/`), Redis on `localhost:6379` |
| **Auth-Security** | Redis (optional — falls back to in-memory), SQLite auto-created |
| **Skillscore** | Python deps + optional Node.js for `/combine` endpoint |

**Manual start commands** (if background manager fails):

```bash
# ProMatch (port 8002)
cd TFN_backend && uvicorn app.main:app --port 8002

# Auth-Security (port 8000)
cd Auth-Security && uvicorn app.main:app --port 8000

# Skillscore (port 8003)
cd event-algorithm && uvicorn api.app:app --port 8003
```
"""
)

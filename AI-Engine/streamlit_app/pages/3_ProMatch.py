"""ProMatch API testing page — mirrors test_client.html functionality."""
import json

import streamlit as st

from lib.config import INTENT_OPTIONS, PROMATCH_URL, SUPABASE_ANON_KEY, SUPABASE_URL
from lib.http_client import request
from lib.state import get_log, init_state

init_state()
log = get_log()

st.title("💼 ProMatch API")
st.caption(f"Testing `{PROMATCH_URL}` — discovery, likes, matches, messages")

# ── Supabase auth helper ────────────────────────────────────────────────
with st.expander("🔑 Supabase Auth (get JWT tokens)", expanded=False):
    st.caption("Sign up or log in via Supabase to obtain JWT tokens for User A/B")
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        st.warning("Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `TFN_backend/.env` to enable Supabase login here.")
    else:
        sb_email = st.text_input("Email", key="sb_email")
        sb_password = st.text_input("Password", type="password", key="sb_pw")
        sb_user = st.radio("Assign token to", ["User A", "User B"], horizontal=True)

        c1, c2 = st.columns(2)
        with c1:
            if st.button("Supabase Sign Up"):
                import httpx

                try:
                    with httpx.Client(timeout=15.0) as client:
                        resp = client.post(
                            f"{SUPABASE_URL}/auth/v1/signup",
                            json={"email": sb_email, "password": sb_password},
                            headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
                        )
                        data = resp.json()
                        if resp.status_code < 300 and data.get("access_token"):
                            key = "token_a" if sb_user == "User A" else "token_b"
                            st.session_state[key] = data["access_token"]
                            st.success(f"Token assigned to {sb_user}")
                        else:
                            st.error(data)
                except Exception as exc:
                    st.error(str(exc))
        with c2:
            if st.button("Supabase Login"):
                import httpx

                try:
                    with httpx.Client(timeout=15.0) as client:
                        resp = client.post(
                            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
                            json={"email": sb_email, "password": sb_password},
                            headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
                        )
                        data = resp.json()
                        if resp.status_code < 300 and data.get("access_token"):
                            key = "token_a" if sb_user == "User A" else "token_b"
                            st.session_state[key] = data["access_token"]
                            st.success(f"Token assigned to {sb_user}")
                        else:
                            st.error(data)
                except Exception as exc:
                    st.error(str(exc))

col_a, col_b = st.columns(2)

for label, key, color in [("User A", "a", "🔵"), ("User B", "b", "🟢")]:
    with col_a if key == "a" else col_b:
        st.subheader(f"{color} {label}")
        token_key = f"token_{key}"
        profile_key = f"profile_{key}"

        st.session_state[token_key] = st.text_area(
            "JWT Token",
            value=st.session_state.get(token_key, ""),
            height=80,
            key=f"jwt_{key}",
        )

        if st.button(f"Load Profile ({label})", key=f"load_{key}"):
            res = request("GET", PROMATCH_URL, "/api/v1/me", token=st.session_state[token_key], log=log)
            if res.ok:
                st.session_state[profile_key] = res.data
                st.success(f"@{res.data.get('username', '?')} — {res.data.get('display_name', '')}")
            else:
                st.error(res.data)

        profile = st.session_state.get(profile_key)
        if profile:
            st.json({"id": profile.get("id"), "username": profile.get("username"), "looking_for": profile.get("looking_for")})

st.divider()

tab_feed, tab_social, tab_mutual, tab_custom = st.tabs(
    ["Discovery", "Matches & Messages", "Mutual Like Test", "Custom Request"]
)

with tab_feed:
    user = st.radio("Acting as", ["User A", "User B"], horizontal=True, key="feed_user")
    u = "a" if user == "User A" else "b"
    intent = st.selectbox("Intent filter", [""] + INTENT_OPTIONS, format_func=lambda x: x or "All intents")

    if st.button("Load Discovery Feed", type="primary"):
        token = st.session_state.get(f"token_{u}", "")
        qs = f"?looking_for={intent}" if intent else ""
        res = request("GET", PROMATCH_URL, f"/api/v1/discovery/feed{qs}", token=token, log=log)
        if res.ok:
            items = res.data.get("items", [])
            st.caption(f"{len(items)} profiles | {res.elapsed_ms:.0f}ms")
            for item in items:
                p = item.get("profile", {})
                score = item.get("score", 0)
                with st.container(border=True):
                    st.markdown(f"**{p.get('display_name', '?')}** @{p.get('username', '?')} — score `{score:.3f}`")
                    if p.get("headline"):
                        st.caption(p["headline"])
                    bc1, bc2 = st.columns(2)
                    with bc1:
                        if st.button("👍 Like", key=f"like_{u}_{p.get('id')}"):
                            like_res = request(
                                "POST",
                                PROMATCH_URL,
                                "/api/v1/likes",
                                token=token,
                                json_body={"likee_id": p["id"], "intents": [intent or "collaboration"]},
                                log=log,
                            )
                            if like_res.ok:
                                match = like_res.data.get("match")
                                st.success("Match!" if match else "Like sent")
                            else:
                                st.error(like_res.data)
                    with bc2:
                        if st.button("👎 Pass", key=f"pass_{u}_{p.get('id')}"):
                            request(
                                "POST",
                                PROMATCH_URL,
                                "/api/v1/passes",
                                token=token,
                                json_body={"likee_id": p["id"]},
                                log=log,
                            )
                            st.info("Passed")
        else:
            st.error(res.data)

with tab_social:
    user = st.radio("Acting as", ["User A", "User B"], horizontal=True, key="match_user")
    u = "a" if user == "User A" else "b"
    token = st.session_state.get(f"token_{u}", "")

    if st.button("Load Matches"):
        res = request("GET", PROMATCH_URL, "/api/v1/matches", token=token, log=log)
        if res.ok:
            matches = res.data if isinstance(res.data, list) else []
            st.session_state[f"matches_{u}"] = matches
            for m in matches:
                with st.expander(f"Match {m.get('id', '')[:8]}… — {m.get('status')}"):
                    st.json(m)
                    match_id = m["id"]
                    msg_res = request(
                        "GET",
                        PROMATCH_URL,
                        f"/api/v1/matches/{match_id}/messages",
                        token=token,
                        log=log,
                    )
                    if msg_res.ok:
                        st.write("Messages:")
                        for msg in msg_res.data or []:
                            st.text(f"[{msg.get('created_at', '')[:19]}] {msg.get('content', '')}")

                    new_msg = st.text_input("New message", key=f"msg_{match_id}")
                    if st.button("Send", key=f"send_{match_id}"):
                        send_res = request(
                            "POST",
                            PROMATCH_URL,
                            f"/api/v1/matches/{match_id}/messages",
                            token=token,
                            json_body={"content": new_msg, "kind": "text"},
                            log=log,
                        )
                        st.success("Sent") if send_res.ok else st.error(send_res.data)
        else:
            st.error(res.data)

with tab_mutual:
    st.caption("A likes B, then B likes A — tests mutual match creation")
    intent = st.selectbox("Shared intent", INTENT_OPTIONS, key="mutual_intent")

    if st.button("Run Mutual Like Test", type="primary"):
        pa = st.session_state.get("profile_a")
        pb = st.session_state.get("profile_b")
        ta = st.session_state.get("token_a")
        tb = st.session_state.get("token_b")

        if not all([pa, pb, ta, tb]):
            st.error("Load profiles for both User A and User B first.")
        else:
            out = st.empty()
            out.write(f"A likes B ({pb['id'][:8]}…)…")
            r1 = request(
                "POST",
                PROMATCH_URL,
                "/api/v1/likes",
                token=ta,
                json_body={"likee_id": pb["id"], "intents": [intent]},
                log=log,
            )
            if not r1.ok:
                st.error(r1.data)
            else:
                out.write(f"✓ A→B done. Match: {r1.data.get('match', 'none')}")
                r2 = request(
                    "POST",
                    PROMATCH_URL,
                    "/api/v1/likes",
                    token=tb,
                    json_body={"likee_id": pa["id"], "intents": [intent]},
                    log=log,
                )
                if r2.ok and r2.data.get("match"):
                    st.balloons()
                    st.success(f"🎉 MATCH CREATED: {r2.data['match']['id']}")
                    st.json(r2.data["match"])
                elif r2.ok:
                    st.info("B liked A but no match created — check intent overlap.")
                else:
                    st.error(r2.data)

with tab_custom:
    method = st.selectbox("Method", ["GET", "POST", "PATCH", "DELETE"], key="pm_method")
    path = st.text_input("Path", value="/api/v1/me", key="pm_path")
    pm_user = st.selectbox("Auth as", ["User A", "User B", "None"], key="pm_auth")
    body = st.text_area("JSON Body", "{}", key="pm_body")

    if st.button("Send", type="primary", key="pm_send"):
        token = None
        if pm_user == "User A":
            token = st.session_state.get("token_a")
        elif pm_user == "User B":
            token = st.session_state.get("token_b")
        json_body = json.loads(body) if body.strip() and method in ("POST", "PATCH") else None
        res = request(method, PROMATCH_URL, path, token=token, json_body=json_body, log=log)
        st.caption(f"{res.status} | {res.elapsed_ms:.0f}ms")
        st.json(res.data if res.data is not None else {"error": res.error})

"""Auth-Security testing page."""
import streamlit as st

from lib.config import AUTH_URL, ROLE_OPTIONS
from lib.http_client import request
from lib.state import get_log, init_state

init_state()
log = get_log()

st.title("🔐 Auth & Security")
st.caption(f"Testing `{AUTH_URL}` — register, login, OAuth, and protected routes")

tab_reg, tab_login, tab_oauth, tab_me, tab_custom = st.tabs(
    ["Register", "Login", "Google / LinkedIn", "Current User", "Custom Request"]
)

with tab_oauth:
    st.subheader("OAuth Sign-In")
    st.caption(
        "Google and LinkedIn use browser redirects and httpOnly cookies. "
        "Start the flow here, or use the built-in Auth-Security console for the full cookie-based experience."
    )

    providers = request("GET", AUTH_URL, "/api/auth/providers", log=log)
    if providers.ok:
        p = providers.data
        c1, c2, c3 = st.columns(3)
        with c1:
            st.metric("Google", "✅ Configured" if p.get("google") else "❌ Not configured")
        with c2:
            st.metric("LinkedIn", "✅ Configured" if p.get("linkedin") else "❌ Not configured")
        with c3:
            st.metric("Email/Password", "✅" if p.get("email_password") else "—")
    else:
        st.warning("Could not reach Auth-Security. Start the service from **Service Manager**.")
        p = {}

    st.divider()

    col_g, col_li = st.columns(2)
    with col_g:
        google_ok = providers.ok and providers.data.get("google")
        st.markdown("#### Google")
        if google_ok:
            st.link_button(
                "🔵 Sign in with Google",
                f"{AUTH_URL}/api/auth/google/login",
                use_container_width=True,
                type="primary",
            )
            st.caption("Opens Google OAuth → redirects back to Auth-Security with session cookies.")
        else:
            st.button("🔵 Sign in with Google", disabled=True, use_container_width=True)
            st.caption("Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (or `GOOGLE_CREDENTIALS_FILE`) in `Auth-Security/.env`.")

    with col_li:
        linkedin_ok = providers.ok and providers.data.get("linkedin")
        st.markdown("#### LinkedIn")
        if linkedin_ok:
            st.link_button(
                "🔗 Sign in with LinkedIn",
                f"{AUTH_URL}/api/auth/linkedin/login",
                use_container_width=True,
                type="primary",
            )
            st.caption("Opens LinkedIn OAuth → redirects back to Auth-Security with session cookies.")
        else:
            st.button("🔗 Sign in with LinkedIn", disabled=True, use_container_width=True)
            st.caption("Set `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` in `Auth-Security/.env`.")

    st.divider()
    st.markdown("#### Auth-Security Test Console (recommended for OAuth)")
    st.markdown(
        f"The native HTML console at **[{AUTH_URL}]({AUTH_URL})** handles OAuth cookies correctly. "
        "After signing in there, copy your access token from the browser dev tools or use **Current User** below."
    )
    st.link_button("Open Auth-Security Console", AUTH_URL, use_container_width=True)

    with st.expander("OAuth setup (.env)"):
        st.code(
            f"""# Auth-Security/.env
GOOGLE_CREDENTIALS_FILE=client_secret_....json
GOOGLE_REDIRECT_URI={AUTH_URL}/api/auth/google/callback

LINKEDIN_CLIENT_ID=your_linkedin_client_id
LINKEDIN_CLIENT_SECRET=your_linkedin_client_secret
LINKEDIN_REDIRECT_URI={AUTH_URL}/api/auth/linkedin/callback

OAUTH_SUCCESS_REDIRECT={AUTH_URL}/
""",
            language="ini",
        )

with tab_reg:
    st.subheader("Register New User")
    with st.form("register_form"):
        email = st.text_input("Email", placeholder="user@example.com")
        password = st.text_input("Password", type="password")
        full_name = st.text_input("Full Name", placeholder="Jane Doe")
        role = st.selectbox("Role", ROLE_OPTIONS)
        submitted = st.form_submit_button("Register", type="primary")

    if submitted:
        res = request(
            "POST",
            AUTH_URL,
            "/api/auth/register",
            json_body={
                "email": email,
                "password": password,
                "full_name": full_name or None,
                "role": role,
            },
            log=log,
        )
        if res.ok:
            st.session_state.auth_token = res.data.get("access_token", "")
            st.session_state.auth_user = res.data.get("user")
            st.success(f"Registered! Token saved. User: {res.data.get('user', {}).get('email')}")
            st.json(res.data)
        else:
            st.error(f"Failed ({res.status}): {res.data}")

with tab_login:
    st.subheader("Login")
    with st.form("login_form"):
        email = st.text_input("Email", key="login_email")
        password = st.text_input("Password", type="password", key="login_pw")
        submitted = st.form_submit_button("Login", type="primary")

    if submitted:
        res = request(
            "POST",
            AUTH_URL,
            "/api/auth/login",
            json_body={"email": email, "password": password},
            log=log,
        )
        if res.ok:
            st.session_state.auth_token = res.data.get("access_token", "")
            st.session_state.auth_user = res.data.get("user")
            st.success("Logged in! Token saved to session.")
            st.json(res.data)
        else:
            st.error(f"Failed ({res.status}): {res.data}")

with tab_me:
    token = st.text_input(
        "Access Token",
        value=st.session_state.get("auth_token", ""),
        type="password",
        key="auth_token_input",
    )
    if token:
        st.session_state.auth_token = token

    c1, c2 = st.columns(2)
    with c1:
        if st.button("GET /api/auth/me"):
            res = request("GET", AUTH_URL, "/api/auth/me", token=token, log=log)
            if res.ok:
                st.session_state.auth_user = res.data
                st.json(res.data)
            else:
                st.error(res.data)
    with c2:
        if st.button("POST /api/auth/logout"):
            res = request("POST", AUTH_URL, "/api/auth/logout", token=token, log=log)
            st.json(res.data if res.data else {"status": res.status})

    if st.session_state.get("auth_user"):
        st.subheader("Session User")
        st.json(st.session_state.auth_user)

with tab_custom:
    method = st.selectbox("Method", ["GET", "POST", "PATCH", "DELETE"])
    path = st.text_input("Path", value="/api/auth/me")
    body = st.text_area("JSON Body", value="{}", height=100)
    use_auth = st.checkbox("Use saved token", value=True)

    if st.button("Send Request", type="primary"):
        import json

        json_body = None
        if body.strip() and method in ("POST", "PATCH"):
            try:
                json_body = json.loads(body)
            except json.JSONDecodeError:
                st.error("Invalid JSON body")
                st.stop()

        token = st.session_state.get("auth_token") if use_auth else None
        res = request(method, AUTH_URL, path, token=token, json_body=json_body, log=log)
        st.caption(f"Status: {res.status} | {res.elapsed_ms:.0f}ms")
        st.json(res.data if res.data is not None else {"error": res.error})

"""Shared Streamlit session state helpers."""
from __future__ import annotations

import streamlit as st

from lib.http_client import RequestLog
from lib.service_manager import ServiceManager


def init_state() -> None:
    defaults = {
        "request_log": RequestLog(),
        "service_manager": ServiceManager(),
        "token_a": "",
        "token_b": "",
        "profile_a": None,
        "profile_b": None,
        "auth_token": "",
        "auth_user": None,
    }
    for key, val in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = val


def get_log() -> RequestLog:
    init_state()
    return st.session_state.request_log


def get_manager() -> ServiceManager:
    init_state()
    return st.session_state.service_manager

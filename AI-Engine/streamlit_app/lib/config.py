"""Central configuration for the TFN unified testing platform."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
load_dotenv(ROOT / "TFN_backend" / ".env")
load_dotenv(ROOT / "Auth-Security" / ".env")

# Service URLs (defaults avoid port conflicts)
PROMATCH_URL = os.getenv("PROMATCH_URL", "http://localhost:8002").rstrip("/")
AUTH_URL = os.getenv("AUTH_URL", "http://localhost:8000").rstrip("/")
SKILLSCORE_URL = os.getenv("SKILLSCORE_URL", "http://localhost:8003").rstrip("/")

# Supabase (for ProMatch JWT auth in Streamlit)
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")

# Paths to subprojects
TFN_BACKEND = ROOT / "TFN_backend"
AUTH_SECURITY = ROOT / "Auth-Security"
EVENT_ALGORITHM = ROOT / "event-algorithm"

INTENT_OPTIONS = [
    "collaboration",
    "networking",
    "mentorship_mentor",
    "mentorship_mentee",
    "cofounder",
    "dating",
]

ROLE_OPTIONS = ["student", "professional", "admin"]

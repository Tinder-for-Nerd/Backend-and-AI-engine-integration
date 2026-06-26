#!/usr/bin/env python3
"""Launch the TFN unified Streamlit testing platform."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STREAMLIT_DIR = ROOT / "streamlit_app"


def main() -> None:
    cmd = [
        sys.executable,
        "-m",
        "streamlit",
        "run",
        "Home.py",
        "--server.headless",
        "true",
        "--browser.gatherUsageStats",
        "false",
    ]
    print("Starting TFN Platform Tester at http://localhost:8501")
    print(f"Working directory: {STREAMLIT_DIR}")
    raise SystemExit(subprocess.call(cmd, cwd=str(STREAMLIT_DIR)))


if __name__ == "__main__":
    main()

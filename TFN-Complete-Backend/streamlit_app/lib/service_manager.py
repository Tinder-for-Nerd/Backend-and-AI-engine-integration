"""Start and stop TFN backend services as background processes."""
from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

from lib.config import AUTH_SECURITY, AUTH_URL, EVENT_ALGORITHM, PROMATCH_URL, SKILLSCORE_URL, TFN_BACKEND
from lib.http_client import request


@dataclass
class ServiceSpec:
    name: str
    cwd: Path
    command: list[str]
    url: str
    health_path: str
    env: dict[str, str] = field(default_factory=dict)


def _python_exe() -> str:
    return sys.executable


def _venv_python(project_dir: Path) -> str:
    """Prefer the subproject venv when present (Auth-Security needs authlib, etc.)."""
    if sys.platform == "win32":
        candidate = project_dir / ".venv" / "Scripts" / "python.exe"
    else:
        candidate = project_dir / ".venv" / "bin" / "python"
    return str(candidate) if candidate.exists() else _python_exe()


SERVICES: dict[str, ServiceSpec] = {
    "promatch": ServiceSpec(
        name="ProMatch API",
        cwd=TFN_BACKEND,
        command=[_venv_python(TFN_BACKEND), "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"],
        url=PROMATCH_URL,
        health_path="/healthz",
    ),
    "auth": ServiceSpec(
        name="Auth-Security",
        cwd=AUTH_SECURITY,
        command=[_venv_python(AUTH_SECURITY), "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"],
        url=AUTH_URL,
        health_path="/health",
    ),
    "skillscore": ServiceSpec(
        name="Skillscore API",
        cwd=EVENT_ALGORITHM,
        command=[_venv_python(EVENT_ALGORITHM), "-m", "uvicorn", "api.app:app", "--host", "0.0.0.0", "--port", "8003"],
        url=SKILLSCORE_URL,
        health_path="/docs",
    ),
}


class ServiceManager:
    def __init__(self) -> None:
        self._processes: dict[str, subprocess.Popen] = {}

    def is_running(self, key: str) -> bool:
        proc = self._processes.get(key)
        return proc is not None and proc.poll() is None

    def start(self, key: str) -> tuple[bool, str]:
        if self.is_running(key):
            return True, f"{SERVICES[key].name} already running (pid {self._processes[key].pid})"

        spec = SERVICES[key]
        if not spec.cwd.exists():
            return False, f"Directory not found: {spec.cwd}"

        env = {**os.environ, **spec.env}
        creationflags = 0
        if sys.platform == "win32":
            creationflags = subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]

        try:
            proc = subprocess.Popen(
                spec.command,
                cwd=str(spec.cwd),
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=creationflags,
            )
        except Exception as exc:
            return False, str(exc)

        self._processes[key] = proc
        return True, f"Started {spec.name} (pid {proc.pid})"

    def stop(self, key: str) -> tuple[bool, str]:
        proc = self._processes.get(key)
        if proc is None or proc.poll() is not None:
            self._processes.pop(key, None)
            return True, f"{SERVICES[key].name} not running"

        try:
            if sys.platform == "win32":
                proc.terminate()
            else:
                proc.send_signal(signal.SIGTERM)
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
        self._processes.pop(key, None)
        return True, f"Stopped {SERVICES[key].name}"

    def start_all(self) -> list[str]:
        messages = []
        for key in SERVICES:
            ok, msg = self.start(key)
            messages.append(f"{'✓' if ok else '✗'} {msg}")
            time.sleep(1.5)
        return messages

    def stop_all(self) -> list[str]:
        messages = []
        for key in list(SERVICES.keys()):
            _, msg = self.stop(key)
            messages.append(msg)
        return messages

    def status(self) -> dict[str, dict]:
        result = {}
        for key, spec in SERVICES.items():
            proc_running = self.is_running(key)
            health = request("GET", spec.url, spec.health_path, timeout=3.0)
            result[key] = {
                "name": spec.name,
                "url": spec.url,
                "process": proc_running,
                "pid": self._processes[key].pid if proc_running else None,
                "http_ok": health.ok,
                "http_status": health.status,
                "error": health.error,
            }
        return result

"""Unified HTTP client for all TFN backend services."""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

import httpx


@dataclass
class ApiResult:
    ok: bool
    status: int
    data: Any
    elapsed_ms: float
    error: str | None = None


@dataclass
class RequestLog:
    entries: list[dict[str, Any]] = field(default_factory=list)

    def add(self, method: str, url: str, status: int, elapsed_ms: float, ok: bool) -> None:
        self.entries.insert(
            0,
            {
                "time": time.strftime("%H:%M:%S"),
                "method": method,
                "url": url,
                "status": status,
                "ms": round(elapsed_ms, 1),
                "ok": ok,
            },
        )
        if len(self.entries) > 100:
            self.entries = self.entries[:100]


def request(
    method: str,
    base_url: str,
    path: str,
    *,
    token: str | None = None,
    json_body: dict | list | None = None,
    data: dict | None = None,
    files: dict | None = None,
    timeout: float = 30.0,
    log: RequestLog | None = None,
) -> ApiResult:
    url = f"{base_url.rstrip('/')}{path}"
    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    t0 = time.perf_counter()
    try:
        with httpx.Client(timeout=timeout) as client:
            if files is not None:
                resp = client.request(method, url, headers=headers, data=data, files=files)
            elif json_body is not None:
                resp = client.request(method, url, headers=headers, json=json_body)
            else:
                resp = client.request(method, url, headers=headers, data=data)
        elapsed = (time.perf_counter() - t0) * 1000
        try:
            body = resp.json()
        except Exception:
            body = resp.text
        ok = 200 <= resp.status_code < 300
        if log:
            log.add(method, path, resp.status_code, elapsed, ok)
        return ApiResult(ok=ok, status=resp.status_code, data=body, elapsed_ms=elapsed)
    except httpx.RequestError as exc:
        elapsed = (time.perf_counter() - t0) * 1000
        if log:
            log.add(method, path, 0, elapsed, False)
        return ApiResult(ok=False, status=0, data=None, elapsed_ms=elapsed, error=str(exc))


def check_health(base_url: str, health_path: str = "/health") -> ApiResult:
    return request("GET", base_url, health_path, timeout=5.0)

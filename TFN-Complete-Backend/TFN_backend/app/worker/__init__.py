"""
arq worker entry point.
Job map: string name → coroutine function.
Enqueue via: await enqueue("job_name", payload)
"""
import asyncio
import os

import redis.asyncio as aioredis
from arq import create_pool
from arq.connections import RedisSettings

from app.config import settings
from app.worker.embed_profile import embed_profile
from app.worker.send_notification import send_notification
from app.worker.booking_reminder import booking_reminder
from app.worker.event_reminder import event_reminder
from app.worker.verify_github_link import verify_github_link
from app.worker.cleanup_stale_data import cleanup_stale_data


async def enqueue(job_name: str, payload: dict) -> None:  # type: ignore[type-arg]
    pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    await pool.enqueue_job(job_name, payload)
    await pool.aclose()


class WorkerSettings:
    functions = [
        embed_profile,
        send_notification,
        booking_reminder,
        event_reminder,
        verify_github_link,
        cleanup_stale_data,
    ]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = 10
    job_timeout = 120


if __name__ == "__main__":
    from arq import run_worker

    run_worker(WorkerSettings)

# Mail and Message Automation

Automation is implemented in the Fastify backend worker layer.

## What Runs

- Welcome email + notification after `/auth/register`
- New application email + notification to the startup
- Application status email + notification to the freelancer
- New message email + notification to the recipient
- Match alert helper for future scheduled/recompute jobs

## Main Files

- `apps/api/src/services/automation.ts`
- `apps/api/src/workers/index.ts`
- `packages/queue/src/index.ts`
- `packages/integrations/src/index.ts`

## Run Locally

Start Redis:

```powershell
docker compose up -d redis
```

Start the API:

```powershell
pnpm dev
```

Start the automation worker in another terminal:

```powershell
pnpm dev:worker
```

If `RESEND_API_KEY` is empty, email jobs are processed as skipped but notifications are still inserted.

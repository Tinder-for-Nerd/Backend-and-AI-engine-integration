# TFN Complete Backend

Production-ready backend foundation for the **TFN startup and freelancer marketplace**. The primary backend is a **Node.js 20 + Fastify + pnpm monorepo** with PostgreSQL, Drizzle ORM, Redis, BullMQ workers, authentication, messaging, matching, billing hooks, notifications, and automation.

Existing Python/FastAPI projects are preserved in this repository as legacy services, but the new backend entrypoint is `apps/api`.

## Highlights

- **Fastify API** with modular route registration and OpenAPI docs
- **pnpm monorepo** with reusable packages for DB, auth, queues, integrations, and shared schemas
- **PostgreSQL + Drizzle ORM** schema, indexes, migrations, and seed data
- **Redis-compatible cache/pubsub** for local Redis or Upstash Redis
- **BullMQ workers** for email, notifications, matching, analytics, and cleanup jobs
- **Auth foundation** with email/password, JWT httpOnly cookies, OAuth configuration, roles, rate limiting, and lockout
- **Marketplace APIs** for freelancers, startups, projects, applications, messages, notifications, analytics, matches, files, and billing
- **Free local development mode** using Docker Postgres and Redis

## Architecture

```text
Client / API Docs
      |
      v
apps/api  Fastify API
      |
      +--> packages/auth          Auth helpers, JWT cookies, roles, lockout
      +--> packages/db            Drizzle schema, migrations, seed data
      +--> packages/queue         BullMQ queues and Redis connections
      +--> packages/integrations  Resend, Stripe, Cloudflare R2 helpers
      +--> packages/shared        Shared Zod schemas, enums, types
      |
      +--> PostgreSQL
      +--> Redis / Upstash
      +--> BullMQ Workers
```

## Repository Layout

| Path | Purpose |
|------|---------|
| `apps/api` | Fastify API, routes, plugins, workers, services |
| `packages/db` | Drizzle ORM schema, migrations, DB client, seed script |
| `packages/auth` | Auth helpers, Better Auth config, bcrypt/JWT/session utilities |
| `packages/queue` | Redis connection factory, BullMQ queue and worker helpers |
| `packages/integrations` | Cloudflare R2, Resend, Stripe integration helpers |
| `packages/shared` | Shared validation schemas, roles, status constants |
| `docker-compose.yml` | Local Postgres and Redis services |
| `.env.example` | Environment variable template |
| `streamlit_app` | Legacy testing UI for earlier Python services |

## Prerequisites

- Node.js `20+`
- pnpm `9+`
- Docker Desktop for local Postgres and Redis
- Git

Recommended:

```powershell
corepack enable
```

## Free Local Setup

This mode does not require paid Cloudflare, Stripe, Resend, or Supabase services.

1. Install dependencies:

```powershell
pnpm install
```

2. Create a local environment file:

```powershell
Copy-Item .env.example .env
```

3. Use local database/cache values in `.env`:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/tfn
REDIS_URL=redis://localhost:6379
```

4. Start local infrastructure:

```powershell
docker compose up -d postgres redis
```

5. Apply migrations:

```powershell
pnpm db:migrate
```

6. Optional: seed sample data:

```powershell
pnpm db:seed
```

7. Start the Fastify API:

```powershell
pnpm dev
```

8. Start background workers in another terminal:

```powershell
pnpm dev:worker
```

9. Open API docs:

```text
http://localhost:3000/docs
```

## Environment Variables

Required for local core backend:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/tfn
REDIS_URL=redis://localhost:6379
BETTER_AUTH_SECRET=replace-with-a-strong-32-byte-secret
JWT_SECRET=replace-with-a-strong-jwt-secret
```

Optional integrations:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=

RESEND_API_KEY=
RESEND_FROM_EMAIL=TFN <notifications@example.com>

STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PRO=
STRIPE_PRICE_TEAM=
```

If optional integrations are empty, the core backend still runs. The related endpoints will either skip external calls or return a clear `not_configured` response.

## Supabase Postgres Option

You can use Supabase Postgres instead of local Docker Postgres. For the Supabase transaction-mode pooler, use the pooler URL in `.env`:

```env
DATABASE_URL=postgresql://postgres.PROJECT_REF:YOUR_PASSWORD@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres
```

The database client is configured with:

```ts
prepare: false
```

This is required for Supabase transaction-mode pooling.

## API Surface

| Route | Purpose |
|-------|---------|
| `/health` | Basic health check |
| `/ready` | Database and Redis readiness check |
| `/auth` | Register, login, providers, refresh, logout, current user |
| `/freelancers` | Freelancer profiles, skills, portfolio, rates, availability |
| `/startups` | Startup/company profile management |
| `/projects` | Project posting, editing, listing, search, deletion |
| `/matches` | Cached matching feed, fit scores, signal recording |
| `/applications` | Apply, list, shortlist, accept, decline |
| `/messages` | Conversations, send message, read receipts |
| `/notifications` | Inbox and mark-read workflows |
| `/analytics` | Profile views, match quality, response rates |
| `/files` | Cloudflare R2 signed upload URLs |
| `/billing` | Stripe checkout, portal, webhook handler |

## Background Automation

Workers are powered by BullMQ and Redis.

```powershell
pnpm dev:worker
```

Implemented automation:

- Welcome notification/email after registration
- New application notification/email to startup
- Application status notification/email to freelancer
- New message notification/email to recipient
- Match recompute pub/sub event
- Analytics event persistence
- File cleanup job

If `RESEND_API_KEY` is empty, email jobs are safely skipped while notifications are still stored.

## Database

Main schema location:

```text
packages/db/src/schema.ts
```

Generated migration:

```text
packages/db/drizzle/0000_legal_gressill.sql
```

Useful commands:

```powershell
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Core tables include:

- `users`
- `freelancers`
- `startups`
- `projects`
- `applications`
- `conversations`
- `messages`
- `ratings`
- `notifications`
- `match_signals`
- `analytics_events`
- `subscriptions`
- `stripe_events`
- `file_assets`
- `audit_logs`

Indexes are included for auth lookup, project search, matching feed, application status, unread messages, notification inbox, analytics ranges, and Stripe webhook idempotency.

## Scripts

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Start Fastify API in watch mode |
| `pnpm dev:worker` | Start BullMQ workers in watch mode |
| `pnpm build` | Build all workspace packages |
| `pnpm typecheck` | Run TypeScript checks |
| `pnpm test` | Run workspace tests |
| `pnpm lint` | Run TypeScript lint-style checks |
| `pnpm db:generate` | Generate Drizzle migration files |
| `pnpm db:migrate` | Apply Drizzle migrations |
| `pnpm db:seed` | Seed sample local data |

## Validation

Run before pushing changes:

```powershell
pnpm typecheck
pnpm test
pnpm build
```

Check API:

```powershell
Invoke-WebRequest http://localhost:3000/health -UseBasicParsing
Invoke-WebRequest http://localhost:3000/ready -UseBasicParsing
```

Expected `/health` response:

```json
{"status":"ok","service":"tfn-fastify-api"}
```

## Troubleshooting

### Redis is not reachable

Start Redis:

```powershell
docker compose up -d redis
```

Or set an Upstash Redis URL:

```env
REDIS_URL=your_upstash_redis_url
```

### Docker cannot connect

Start Docker Desktop and wait until it says Docker is running.

Then:

```powershell
docker compose up -d postgres redis
```

### Database tables are missing

Run:

```powershell
pnpm db:migrate
```

### OAuth providers show false

Check `.env`:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
```

Restart the API after editing `.env`:

```powershell
pnpm dev
```

## Legacy Services

These legacy folders may still exist while the Fastify backend supersedes them:

| Service | Port | Directory |
|---------|------|-----------|
| ProMatch FastAPI | 8002 | `TFN_backend/` |
| Auth-Security FastAPI | 8000 | `Auth-Security/` |
| Skillscore FastAPI | 8003 | `event-algorithm/` |
| Streamlit Tester | 8501 | `streamlit_app/` |

For the new backend, use:

```text
http://localhost:3000/docs
```

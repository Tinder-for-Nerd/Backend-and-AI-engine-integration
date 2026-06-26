# Auth-Security

FastAPI authentication backend for hackathon testing. Implements OAuth, email/password, JWT + Redis sessions, role-based access, rate limiting, and brute-force lockout.

## Why FastAPI (not Streamlit)?

| Feature | FastAPI | Streamlit |
|---------|---------|-----------|
| OAuth redirects / callbacks | Native HTTP routes | Awkward / limited |
| httpOnly cookies | Full control | Not supported |
| JWT refresh flow | Standard REST | Poor fit |
| Rate limiting middleware | Yes | No |
| API testing (Postman/curl) | Yes | UI-only |

Use the included **test console** at `http://localhost:8000/` for manual UI testing.

> **Note:** [Better Auth](https://www.better-auth.com/) is a Node.js library. This project implements the same patterns in Python (Authlib + custom JWT/Redis layer).

## Features

- **Google OAuth 2.0** (OpenID Connect via Authlib)
- **LinkedIn OAuth** (OpenID Connect)
- **Email + password** with bcrypt (cost factor 12)
- **JWT access tokens** (15 min) + **refresh tokens in Redis** (30 days)
- **httpOnly cookies** (`Secure`, `SameSite=Strict` — set `COOKIE_SECURE=true` in production)
- **Roles:** `student` | `professional` | `admin`
- **Rate limiting:** 100 req/min (API), 5 req/min (auth routes)
- **Brute-force lockout:** 5 failed logins → 15 min lockout

## Quick start

### 1. Start Redis

```bash
docker compose up -d
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — set SECRET_KEY and OAuth credentials
```

### 3. Install & run

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Open:

- **Test UI:** http://localhost:8000/
- **Swagger docs:** http://localhost:8000/docs
- **Health:** http://localhost:8000/health

## OAuth setup

### Google

1. Create a project at [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Google+ API** / configure OAuth consent screen
3. Create OAuth 2.0 credentials (Web application)
4. Authorized redirect URI: `http://localhost:8000/api/auth/google/callback`
5. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`

### LinkedIn

1. Create an app at [LinkedIn Developers](https://www.linkedin.com/developers/)
2. Add redirect URL: `http://localhost:8000/api/auth/linkedin/callback`
3. Request **Sign In with LinkedIn using OpenID Connect** product
4. Set `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` in `.env`

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register with email/password |
| POST | `/api/auth/login` | Login (sets httpOnly cookies) |
| POST | `/api/auth/refresh` | Rotate refresh token |
| POST | `/api/auth/logout` | Revoke refresh token + clear cookies |
| GET | `/api/auth/me` | Current user |
| GET | `/api/auth/google/login` | Start Google OAuth |
| GET | `/api/auth/linkedin/login` | Start LinkedIn OAuth |
| GET | `/api/users/student-only` | Role-gated example |
| GET | `/api/users/admin-only` | Admin only |
| PATCH | `/api/users/{id}/role` | Admin: change user role |

## Testing with curl

```bash
# Register
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","role":"student"}' \
  -c cookies.txt

# Login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' \
  -c cookies.txt

# Protected route (uses cookie)
curl http://localhost:8000/api/auth/me -b cookies.txt
```

## Production notes

- Set `COOKIE_SECURE=true` (requires HTTPS)
- Use a strong `SECRET_KEY` (32+ random bytes)
- Replace SQLite with PostgreSQL for production
- Run Redis with persistence and auth enabled

# Alaga Counseling Booking Platform

Counseling session booking platform with a FastAPI backend (`backend/`) and Next.js App Router frontend (`frontend-landing/`).

## Structure

- `backend/` — FastAPI async API (SQLAlchemy, Alembic, Celery, Google Calendar & Gmail integration, manual payment proof & verification).
- `frontend-landing/` — Next.js 16 + React 19 + Tailwind CSS frontend for clients, counselors, and admins.

## Local Setup

### Backend (`backend/`)

```bash
cd backend
cp .env.example .env   # Fill in DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, FRONTEND_URL, etc.
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

### Frontend (`frontend-landing/`)

```bash
cd frontend-landing
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_URL=http://localhost:8000` (default) in `frontend-landing/.env.local` if needed.

## Verification

```bash
# Backend tests & lint
cd backend && uv run pytest && uv run ruff check .

# Frontend lint, typecheck & production build
cd frontend-landing && npm run lint && npx tsc --noEmit && npm run build
```

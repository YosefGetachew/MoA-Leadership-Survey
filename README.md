# MoA Leadership Assessment Survey

This application combines seven overall institutional-reform assessment statements with the Ministry of Agriculture's final leadership questionnaire (Vf1). Respondents select one leadership level, choose the sector or institution being evaluated from a standardized dropdown, and rate every statement from 1–5 or N/A. Evaluator name, organization, position and contact information are optional.

## Architecture

- `frontend/` — React 19 + TypeScript + Vite
- `backend/` — Node.js + Express REST API
- PostgreSQL — dedicated leadership assessment responses and staff accounts

## Quick start with PostgreSQL

1. Start the locally installed PostgreSQL Windows service and create a database named `moa_reform_feedback`.
2. Create config: `Copy-Item backend/.env.example backend/.env`, then enter the local PostgreSQL username and password.
3. In `backend/`, run `npm install`, `npm run db:migrate`, then `npm run dev`.
4. In `frontend/`, run `npm install`, then `npm run dev`.

Open `http://localhost:3000`. The API runs on `http://127.0.0.1:5001`, and Vite proxies `/api` during development.

Change `MINISTRY_ADMIN_PASSWORD` and `MINISTRY_ADMIN_SESSION` before using the system outside local development.

## Questionnaire coverage

The form first presents seven overall reform statements, followed by 23 high-level, 28 middle-level, or 18 lower-level leadership statements. English and Amharic appear together in a SurveyMonkey-style rating matrix. Leadership positions are filtered by the selected leadership level, and the sector/institution dropdown stays disabled until a specific leadership position is chosen, then shows only the sectors or institutions registered for that exact position (e.g. State Minister sectors for "State Minister", Lead Executive offices for "Lead Executive"). Administrators register, edit, activate, and deactivate sector options for each leadership level and position combination. All displayed statements and the evaluated sector are required; N/A is a valid response. The protected administration page also provides response counts, average scores, N/A rate, item analysis, recent submissions, optional evaluator details, and CSV export.

## Production

Run `npm run build` in `frontend/`, deploy `frontend/build` as static files, and run `backend/server.js` behind a reverse proxy. Use TLS, a long random session secret, a dedicated PostgreSQL role, database backups, and an explicit `ALLOWED_ORIGINS` value.

See [DEPLOYMENT.md](DEPLOYMENT.md) for Git push instructions and the complete Windows Server, IIS, PM2, and PostgreSQL deployment procedure.

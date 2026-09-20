# Nexus AI — Web

A standalone, fully-responsive React (Vite + TypeScript) web app that reuses the
existing Nexus AI backend REST API. It mirrors the Android app's Expense, News,
AI Tutor, Cloud, Settings and Login features and deploys as its own Coolify
service. Production URL: `https://monishlabs.com/nexusai`.

This repository **is** the web app (Vite at the repo root). Android and the
Node API live in their own GitHub repos — clone those too for full setup.

## Repositories

| Piece | GitHub |
| --- | --- |
| **Web (this repo)** | https://github.com/monish0612/ainexus-web |
| Android (Flutter) | https://github.com/monish0612/ainexus-app- |
| Backend API | https://github.com/monish0612/ainexus |
| Narration (TTS) | https://github.com/monish0612/narrator |
| Speech-to-text | https://github.com/monish0612/stt-gateway |


## Tech stack

- **React 18 + Vite + TypeScript**
- **Tailwind CSS** — dark + white themes from `palette.ts` via CSS variables
- **TanStack Query** (server cache/retry) + **Zustand** (settings/auth/UI state)
- **React Router v6** with an auth guard
- **Framer Motion** (animation), **Recharts** (insights), **react-markdown** (rich news/AI), **pdf.js** (receipt scanning)
- **Axios** client with exponential-backoff retry, calling same-origin `/api/*`

## Local development

```bash
npm install
npm run dev          # http://localhost:5173/nexusai/
```

The dev server proxies `/nexusai/api` to the backend. Override the target:

```bash
# .env (copy from .env.example)
VITE_DEV_API_TARGET=https://monishlabs.com
# or a local API:
# VITE_DEV_API_TARGET=http://localhost:3000
```

Build & typecheck:

```bash
npm run typecheck
npm run build        # outputs dist/
```

## Architecture

```
Browser ──HTTPS──► web container (nginx)
                     ├── static assets (SPA, cached)
                     └── /api/* ──reverse proxy──► ainexus-api:3000
                                                     ├── Postgres
                                                     ├── LiteLLM
                                                     └── Google Drive (service account)
```

nginx reverse-proxies `/api/*` to the backend, so the browser is always
same-origin (no CORS / mixed-content). Uploads and downloads stream through
(`proxy_request_buffering off`, `client_max_body_size 0`).

## Backend additions (in the ainexus API repo, additive)

These live in **https://github.com/monish0612/ainexus** (`api/src/`). They power
the web Cloud + receipt-scan features and **do not change** anything the Android
app uses:

- **`/api/v1/cloud/*`** — Google Drive proxy (`cloud-service.js`): list/search,
  quota, streamed upload, download, delete, star, thumbnail. Uses the **same**
  service account + folder as the app, read from env `GOOGLE_DRIVE_SA_JSON`
  (raw JSON or base64). Optional `GOOGLE_DRIVE_FOLDER_ID` override.
- **`POST /api/v1/ai/smart-parse-image`** — vision receipt/bill parsing. Takes a
  base64 image, runs the existing `preprocessForVision` + the
  `SMART_PARSE_SYSTEM_PROMPT` on the user's Gemini lite model, returns the same
  shape as `/ai/smart-parse`. PDFs are rasterized client-side with pdf.js first.

New backend deps: `googleapis`, `busboy` (run `npm install` in the API repo's `api/` folder).

## Deploy on Coolify (separate service)

1. **Backend env** — add `GOOGLE_DRIVE_SA_JSON` to the existing `ainexus-api`
   service (paste the service-account JSON, or a base64 of it). Redeploy so the
   Cloud endpoints come online. (Without it, Cloud returns a friendly 503; every
   other feature works.)
2. **New Application** in the `ainexus` project:
   - Build context: this repo root, **Dockerfile**: `Dockerfile`.
   - Exposed port: **8080**.
   - Env: `API_UPSTREAM=http://ainexus-api:3000` (the backend's in-network name).
   - Attach it to the same Docker network as the backend (`ainexus-network`).
3. Coolify assigns a `*.sslip.io` domain with auto-SSL. Open it and sign in.

## Authentication

The login gate is a faithful port of the app's client-side HMAC-SHA256 username/
password check with a 45-day `localStorage` session (`authService.ts`). The data
APIs are global (single-user), exactly like the Android app.

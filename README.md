# MyDesktop

A web app to manage my day and activities.

## Stack
- **client/** React + TypeScript (Vite)
- **server/** Node + Express + TypeScript (API layer)
- **PostgreSQL** database (via Docker Compose)

## Getting started
```sh
npm run install:all
npm run db:up        # start Postgres (requires Docker)
npm run migrate      # create tables
npm run dev:server   # API on http://localhost:4000
npm run dev:client   # UI on http://localhost:5173 (proxies /api to the API)
```

Copy `server/.env.example` to `server/.env` if it doesn't exist.

## Features
- **Dashboard** - counts, active project progress, recent notes
- **Projects** - roadmaps made of step-by-step phases you tick off
- **Notes** - quick notes (create, edit, delete)

## API
- `GET /api/dashboard`
- `GET|POST /api/projects`, `PATCH|DELETE /api/projects/:id`
- `POST /api/projects/:id/steps`, `PATCH|DELETE /api/steps/:id`
- `GET|POST /api/notes`, `PATCH|DELETE /api/notes/:id`

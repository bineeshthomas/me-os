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
- **Projects** - compact cards, most recently created/updated first; click one to edit its title, description and steps
- **Notes** - quick notes (create, edit, delete)
- **Daily Review** - nightly page: one-tap check-ins with streaks (worked out, read...), wins, unfinished items (keep / move to tomorrow / drop), long-term goals advanced by tiny point steps, reflection, top 3 for tomorrow, brain dump, ratings, and a 7-day summary
- **Links** - save quick-launch links with a name; they open in a new tab (http/https only)
- **Widget rail** - Focus Tasks, Calls, Emails, Messages (pick WhatsApp or Teams), Meetings, Reminders (add, tick off, delete; meetings and reminders take a date and time)
- **Completed items** stay on their card, crossed out, until the end of the day they were ticked, then drop off (they stay in the database)
- **Footer** - a rotating quote and a 🌿-to-⚡ stress meter (0-100, saved in the database)
- **Search** - Ctrl/Cmd+K searches projects, steps, notes and widget items
- **Settings** - connect an Outlook calendar by pasting its published ICS link (stored server-side, never sent back to the browser)
- **Calendar** - click the date/time in the header for a month view with items due each day
- **Header** - weather (Open-Meteo, click to change city; default New Delhi) plus date and time

## Progressive web app
The client is an installable PWA (manifest, icons, service worker). Build it with `npm --prefix client run build`, serve it with `npx --prefix client vite preview`, then use your browser's Install option. The app shell works offline, and the last-loaded data is shown when the API is unreachable. Edits need a connection. Regenerate icons from `client/public/favicon.svg` with `npx pwa-assets-generator` in `client/`.

## API
- `GET /api/dashboard`
- `GET|POST /api/projects`, `PATCH|DELETE /api/projects/:id`
- `POST /api/projects/:id/steps`, `PATCH|DELETE /api/steps/:id`
- `GET|POST /api/items`, `PATCH|DELETE /api/items/:id`
- `GET /api/settings`, `PUT /api/settings/calendar`, `PUT /api/settings/stress`
- `GET /api/search?q=`
- `GET|PUT /api/review/:date`, `PUT /api/review/:date/habits/:id`, `GET /api/review-summary/:date`, `GET /api/focus`
- `GET|POST /api/habits`, `GET|POST /api/goals`, `POST /api/goals/:id/entries`
- `GET|POST /api/links`, `PATCH|DELETE /api/links/:id`
- `GET|POST /api/notes`, `PATCH|DELETE /api/notes/:id`

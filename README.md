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
- **Dashboard** - a 7-day daily-review band with your night streak, counts, active project progress, recent notes
- **Projects** - compact cards, most recently created/updated first; each is Work (default) or Personal (pink badge); click one to edit its title, description, type, due date and steps (drag the ⋮⋮ handle, or use the arrow keys, to reorder steps; each step can have a due date)
- **Notes** - markdown notes with checklists (tick items right on the card), `#tags` with filtering and search, and pin-to-top
- **Daily Review** - nightly page (every section collapses; the choice is remembered) (top 3 for tomorrow also show on the dashboard): one-tap check-ins with streaks (worked out, read...), wins, unfinished items (shown read-only; dated ones roll over to the next day when you finish the review), long-term goals advanced by tiny point steps, reflection, top 3 for tomorrow, brain dump, ratings, and a 7-day summary
- **Review History** (button on the Daily Review page) - browse past reviews with a month heatmap of day rating, energy or stress, month stats, weekday patterns across all your reviews, and a detail view per day
- **Focus timer** - type an activity and start the timer; it keeps running (even across reloads) until you stop it. A card on the dashboard, a running-timer pill in the header on every page, and an **Activity** page with a paged log (rename, delete, totals for today and this week)
- **Links** - save quick-launch links with a name; they open in a new tab (http/https only)
- **Widget rail** - Focus Tasks, Calls, Emails, Messages (pick WhatsApp or Teams), Meetings, Reminders (add, tick off, delete; meetings and reminders take a date and time)
- **Completed items** stay on their card, crossed out, until the end of the day they were ticked, then drop off (they stay in the database)
- **Footer** - a rotating quote and a 🌿-to-⚡ stress meter (0-100, saved in the database)
- **Search** - Ctrl/Cmd+K searches projects, steps, notes and widget items
- **Settings** - connect an Outlook calendar by pasting its published ICS link (stored server-side, never sent back to the browser)
- **Calendar** - click the date/time in the header for a month view with items due each day, Outlook meetings, and project/step deadlines
- **Overnight rollover** - unfinished dated reminders move to the next day automatically (at startup and every 10 minutes, so it catches up after the laptop was asleep)
- **Header** - weather (Open-Meteo, click to change city; default New Delhi) plus date and time

## Progressive web app
The client is an installable PWA (manifest, icons, service worker). Build it with `npm --prefix client run build`, serve it with `npx --prefix client vite preview`, then use your browser's Install option. The app shell works offline, and the last-loaded data is shown when the API is unreachable. Edits need a connection. Regenerate icons from `client/public/favicon.svg` with `npx pwa-assets-generator` in `client/`.

## API
- `GET /api/dashboard`
- `GET|POST /api/projects`, `PATCH|DELETE /api/projects/:id`, `PUT /api/projects/:id/steps/order`, `GET /api/deadlines?from=&to=`
- `POST /api/projects/:id/steps`, `PATCH|DELETE /api/steps/:id`
- `GET|POST /api/items`, `PATCH|DELETE /api/items/:id`
- `GET /api/settings`, `PUT /api/settings/calendar`, `PUT /api/settings/stress`
- `GET /api/search?q=`
- `GET /api/review-history?month=YYYY-MM`
- `GET|PUT /api/review/:date`, `PUT /api/review/:date/habits/:id`, `GET /api/review-summary/:date`, `GET /api/focus`
- `GET|POST /api/habits`, `GET|POST /api/goals`, `POST /api/goals/:id/entries`
- `GET /api/focus/status`, `POST /api/focus/start|stop`, `GET /api/focus/sessions?page=&page_size=`, `PATCH|DELETE /api/focus/sessions/:id`
- `GET|POST /api/links`, `PATCH|DELETE /api/links/:id`
- `GET|POST /api/notes`, `PATCH|DELETE /api/notes/:id`

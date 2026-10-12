# Me-OS API

The app's own HTTP API (served on localhost only). Paths are relative to `/api`.

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
- `GET /api/notes[?project_id=]`, `GET|PATCH|DELETE /api/notes/:id`, `POST /api/notes` (notes take an optional `project_id`)

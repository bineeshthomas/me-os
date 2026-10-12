# Me-OS: builds the app and runs it as one small container (the API also serves the web app).
# Normally you don't use this directly: run `docker compose up -d` (see README).

FROM node:22-alpine AS build
WORKDIR /app
COPY client/package.json client/package-lock.json client/
COPY server/package.json server/package-lock.json server/
RUN npm --prefix client ci && npm --prefix server ci
COPY client client
COPY server server
RUN npm --prefix client run build && npm --prefix server run build

FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000 STATIC_DIR=/app/client/dist
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/client/dist /app/client/dist
USER node
EXPOSE 4000
# Create/upgrade the tables, then start. (Safe to repeat: the schema only adds what's missing.)
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]

FROM node:20-bullseye-slim AS station-web-builder

WORKDIR /app/station-web

COPY station-web/package*.json ./
RUN npm ci

COPY station-web ./
RUN npm run build

FROM node:20-bullseye-slim

WORKDIR /app

ENV NODE_ENV=production

COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci --omit=dev

COPY backend/src ./src
COPY backend/scripts ./scripts
COPY backend/database ./database
COPY agents ../agents
COPY --from=station-web-builder /app/station-web/dist ../station-web/dist

EXPOSE 4390

CMD ["node", "src/server.js"]

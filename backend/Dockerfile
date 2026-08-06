FROM node:22-bookworm-slim AS avatar-web-build

WORKDIR /app/avatar-web

COPY avatar-web/package*.json ./
RUN npm ci

COPY avatar-web/index.html ./
COPY avatar-web/tsconfig.json ./
COPY avatar-web/vite.config.ts ./
COPY avatar-web/src ./src
RUN npm run build

FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci --omit=dev

COPY backend/src ./src
COPY backend/scripts ./scripts
COPY backend/database ./database
COPY agents ../agents
COPY --from=avatar-web-build /app/avatar-web/dist ../avatar-web/dist

RUN mkdir -p storage && chown -R node:node /app
USER node

EXPOSE 4390

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4390) + '/api/ready').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "src/server.js"]

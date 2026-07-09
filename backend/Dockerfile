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

EXPOSE 4390

CMD ["node", "src/server.js"]

# Production image for the NotifyHub API.
# Runtime configuration is injected by Docker/ECS; no .env file is copied.
FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Copy manifests first so dependency installation is cached independently from
# application source changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force

COPY src ./src

EXPOSE 3000
USER node

CMD ["node", "src/server.js"]

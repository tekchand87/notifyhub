# Production image for the NotifyHub API.
# Runtime configuration is injected by Docker/ECS; no .env file is copied.
# Pin the official Node 22 multi-platform manifest for reproducible builds.
# The manifest includes linux/amd64 and linux/arm64 variants.
FROM node:22-bookworm-slim@sha256:48e4b67d85f87bd551df43704e24d252f56cc5f8e9718841aace50f19948f0f9

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

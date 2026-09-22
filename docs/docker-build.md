# NotifyHub Docker builds

The API and worker Dockerfiles are architecture-neutral and use the pinned
Node 22 `bookworm-slim` multi-platform manifest. They can be built for either
`linux/amd64` or `linux/arm64` without changing application code.

## Local Compose development

The Docker Compose production-safe default is `NODE_ENV=production`. To run
the local Docker stack with development-only behavior, set the override
explicitly:

```bash
DOCKER_NODE_ENV=development docker compose up -d --build
```

For a production-like local smoke test, omit the override:

```bash
docker compose up -d --build
```

The Compose environment file remains runtime-only; it is not copied into the
images.

## Build one platform locally

`--load` imports one platform into the local Docker image store. Use the
platform matching the machine or ECS task you are testing:

```bash
docker buildx build \
  --platform linux/amd64 \
  --file Backend/Dockerfile \
  --tag notifyhub-backend:amd64 \
  --load Backend

docker buildx build \
  --platform linux/arm64 \
  --file Backend/Dockerfile.worker \
  --tag notifyhub-worker:arm64 \
  --load Backend
```

The current Dockerfiles expect `Backend` as their build context, matching the
Compose files. If a future Dockerfile uses the repository root as its context,
the root `.dockerignore` protects local environment files, key material,
dependencies, and artifacts.

## Future multi-platform registry build

A registry-backed builder can publish one tag containing both platforms. This
command is documentation only; it does not run as part of local development:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --file Backend/Dockerfile \
  --tag <registry>/notifyhub-backend:<tag> \
  --push Backend
```

Repeat with `Backend/Dockerfile.worker` for the worker image. Configure ECS
with the desired task architecture, or publish both variants and let the
runtime select the compatible image manifest.

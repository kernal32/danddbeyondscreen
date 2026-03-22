# Compose loads `.env` from the repo root (next to docker-compose.yml), not next to this file.
# Only the `backend` service uses env_file; this image is static nginx + the built SPA.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
RUN npm ci
COPY packages/shared-types ./packages/shared-types
COPY apps/frontend ./apps/frontend
RUN npm run build --workspace=@ddb/shared-types
RUN npm run build --workspace=@ddb/frontend

FROM nginx:alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html
EXPOSE 80

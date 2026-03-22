FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
RUN npm ci

FROM deps AS build
COPY packages/shared-types ./packages/shared-types
COPY apps/backend ./apps/backend
RUN npm run build --workspace=@ddb/shared-types
RUN npm run build --workspace=@ddb/backend

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
RUN npm ci --omit=dev
COPY --from=build /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
EXPOSE 3001
CMD ["node", "apps/backend/dist/server.js"]

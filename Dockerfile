# syntax=docker/dockerfile:1

# ---- Build stage ---------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/agui-profile/package.json packages/agui-profile/
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ---- Runtime stage: static files behind nginx, config.json rendered from the environment (UI-PLAT-004) ----
FROM nginx:1.27-alpine AS runner
RUN apk add --no-cache gettext
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker/entrypoint.sh /docker-entrypoint.d/40-hologram-config.sh
RUN chmod +x /docker-entrypoint.d/40-hologram-config.sh
COPY --from=builder /app/dist /usr/share/nginx/html
ENV PORT=8080 NGINX_PORT=8080
EXPOSE 8080

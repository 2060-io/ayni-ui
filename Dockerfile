# syntax=docker/dockerfile:1

# ---- Build stage ---------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ---- Runtime stage: static files behind nginx, config.json rendered from the environment (UI-PLAT-004) ----
FROM nginx:1.27-alpine AS runner
RUN apk add --no-cache gettext
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
# sourced (.envsh) before nginx's own envsubst step, so the CSP origins reach the template
COPY docker/entrypoint.sh /docker-entrypoint.d/15-ayni-config.envsh
COPY docker/render-well-known.sh /docker-entrypoint.d/render-well-known.sh
RUN chmod +x /docker-entrypoint.d/15-ayni-config.envsh /docker-entrypoint.d/render-well-known.sh
COPY --from=builder /app/dist /usr/share/nginx/html
ENV PORT=8080 NGINX_PORT=8080
EXPOSE 8080

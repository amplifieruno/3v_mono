FROM node:22-alpine AS base

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Dependencies for the admin-ui workspace only
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# pnpm.patchedDependencies in the root package.json points here; install fails without it
COPY patches ./patches
COPY apps/admin-ui/package.json ./apps/admin-ui/
RUN HUSKY=0 pnpm install --frozen-lockfile --prefer-offline --filter admin-ui...

# Build the SPA
FROM base AS builder
WORKDIR /app
COPY --from=deps /app ./
COPY apps/admin-ui ./apps/admin-ui/
WORKDIR /app/apps/admin-ui
RUN pnpm exec vite build --mode production

# Serve the static files with nginx
FROM nginx:alpine AS production
WORKDIR /usr/share/nginx/html
RUN rm -rf /etc/nginx/conf.d/*
COPY apps/admin-ui/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/admin-ui/dist ./
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

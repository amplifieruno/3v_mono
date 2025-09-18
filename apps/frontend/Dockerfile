# Multi-stage build for frontend
FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Dependencies stage
FROM base AS deps
WORKDIR /app

# Copy root package files for workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/frontend/package.json ./apps/frontend/

# Install dependencies for the specific workspace (skip husky hooks)
RUN HUSKY=0 pnpm install --frozen-lockfile --prefer-offline --filter frontend...

# Builder stage
FROM base AS builder
WORKDIR /app

# Copy workspace files and dependencies
COPY --from=deps /app ./
COPY apps/frontend ./apps/frontend/

# Build the application
WORKDIR /app/apps/frontend
# Build without type checking (skip tsc)
RUN npx vite build --mode production

# Production stage - serve static files with nginx
FROM nginx:alpine AS production
WORKDIR /usr/share/nginx/html

# Remove default nginx config
RUN rm -rf /etc/nginx/conf.d/*

# Copy custom nginx config
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built application
COPY --from=builder /app/apps/frontend/dist ./

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

# Development stage (optional)
FROM base AS development
WORKDIR /app

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/frontend/package.json ./apps/frontend/
RUN HUSKY=0 pnpm install --filter frontend...

# Copy source code
COPY apps/frontend ./apps/frontend/

WORKDIR /app/apps/frontend

# Expose vite dev server port
EXPOSE 5173

# Start development server
CMD ["pnpm", "dev", "--host", "0.0.0.0"]
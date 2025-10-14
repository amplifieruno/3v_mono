

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Dependencies stage
FROM base AS deps
WORKDIR /app

# Copy root package files for workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin-ui/package.json ./apps/admin-ui/

# Install dependencies for the specific workspace (skip husky hooks)
RUN HUSKY=0 pnpm install --frozen-lockfile --prefer-offline --filter admin-ui...

# Builder stage
FROM base AS builder
WORKDIR /app

# Copy workspace files and dependencies
COPY --from=deps /app ./
COPY apps/admin-ui ./apps/admin-ui/

# Build the application
WORKDIR /app/apps/admin-ui

# Build without type checking (skip tsc)
RUN npx vite build --mode production

# Production stage - serve static files with nginx
FROM nginx:alpine AS production
WORKDIR /usr/share/nginx/html

# Remove default nginx config
RUN rm -rf /etc/nginx/conf.d/*

# Copy custom nginx config
COPY apps/admin-ui/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built application
COPY --from=builder /app/apps/admin-ui/dist ./

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

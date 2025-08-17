# ITAP Development Makefile
# Identity Tracking and Access Platform

.PHONY: help dev infra backend frontend stop clean logs db-reset db-sync build test lint typecheck

# Colors for output
GREEN = \033[0;32m
YELLOW = \033[0;33m
RED = \033[0;31m
NC = \033[0m # No Color

# Default target
.DEFAULT_GOAL := help

## Development Commands

help: ## Show this help message
	@echo "$(GREEN)ITAP - Identity Tracking and Access Platform$(NC)"
	@echo "$(YELLOW)Available commands:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-15s$(NC) %s\n", $$1, $$2}'

dev: ## Start full development environment (infrastructure + backend + frontend)
	@echo "$(GREEN)Starting ITAP development environment...$(NC)"
	@$(MAKE) infra
	@sleep 3
	@$(MAKE) db-sync
	@echo "$(GREEN)Starting backend and frontend...$(NC)"
	@echo "$(YELLOW)Backend will be available at: http://localhost:3001$(NC)"
	@echo "$(YELLOW)Frontend will be available at: http://localhost:5173$(NC)"
	@echo "$(YELLOW)Press Ctrl+C to stop all services$(NC)"
	@pnpm dev

infra: ## Start infrastructure services only (PostgreSQL, Redis, MinIO)
	@echo "$(GREEN)Starting infrastructure services...$(NC)"
	@docker network create itap-network 2>/dev/null || true
	@echo "$(YELLOW)Starting PostgreSQL...$(NC)"
	@docker run -d --name itap-postgres-dev --network itap-network \
		-e POSTGRES_DB=itap_dev \
		-e POSTGRES_USER=itap_user \
		-e POSTGRES_PASSWORD=itap_password \
		-p 5432:5432 \
		postgres:16-alpine 2>/dev/null || docker start itap-postgres-dev
	@echo "$(YELLOW)Starting Redis...$(NC)"
	@docker run -d --name itap-redis-dev --network itap-network \
		-p 6379:6379 \
		redis:7-alpine redis-server --appendonly yes --requirepass redis_password 2>/dev/null || docker start itap-redis-dev
	@echo "$(YELLOW)Starting MinIO...$(NC)"
	@docker run -d --name itap-minio-dev --network itap-network \
		-e MINIO_ROOT_USER=minioadmin \
		-e MINIO_ROOT_PASSWORD=minioadmin123 \
		-p 9000:9000 -p 9001:9001 \
		minio/minio:latest server /data --console-address ":9001" 2>/dev/null || docker start itap-minio-dev
	@echo "$(GREEN)Infrastructure services started!$(NC)"
	@echo "$(YELLOW)PostgreSQL: localhost:5432 (itap_user/itap_password)$(NC)"
	@echo "$(YELLOW)Redis: localhost:6379 (password: redis_password)$(NC)"
	@echo "$(YELLOW)MinIO Console: http://localhost:9001 (minioadmin/minioadmin123)$(NC)"

backend: ## Start backend service only
	@echo "$(GREEN)Starting backend service...$(NC)"
	@pnpm dev:backend

frontend: ## Start frontend service only
	@echo "$(GREEN)Starting frontend service...$(NC)"
	@pnpm dev:frontend

stop: ## Stop all services
	@echo "$(GREEN)Stopping all services...$(NC)"
	@docker stop itap-postgres-dev itap-redis-dev itap-minio-dev 2>/dev/null || true
	@pkill -f "pnpm dev" 2>/dev/null || true
	@echo "$(GREEN)All services stopped$(NC)"

clean: ## Remove all containers, volumes and networks
	@echo "$(RED)Cleaning up all Docker resources...$(NC)"
	@docker stop itap-postgres-dev itap-redis-dev itap-minio-dev 2>/dev/null || true
	@docker rm itap-postgres-dev itap-redis-dev itap-minio-dev 2>/dev/null || true
	@docker volume rm itap-postgres-data itap-redis-data itap-minio-data 2>/dev/null || true
	@docker network rm itap-network 2>/dev/null || true
	@echo "$(GREEN)Cleanup completed$(NC)"

logs: ## Show logs from all services
	@echo "$(GREEN)Showing logs from all services...$(NC)"
	@echo "$(YELLOW)=== PostgreSQL Logs ====$(NC)"
	@docker logs itap-postgres-dev --tail 20 2>/dev/null || echo "PostgreSQL not running"
	@echo "$(YELLOW)=== Redis Logs ====$(NC)"
	@docker logs itap-redis-dev --tail 20 2>/dev/null || echo "Redis not running"
	@echo "$(YELLOW)=== MinIO Logs ====$(NC)"
	@docker logs itap-minio-dev --tail 20 2>/dev/null || echo "MinIO not running"

## Database Commands

db-sync: ## Synchronize database schema (create/update tables)
	@echo "$(GREEN)Synchronizing database schema...$(NC)"
	@sleep 5  # Wait for PostgreSQL to be ready
	@cd apps/backend && npx tsx src/scripts/sync-database.ts
	@echo "$(GREEN)Database schema synchronized!$(NC)"

db-reset: ## Reset database (drop and recreate all tables)
	@echo "$(RED)Resetting database...$(NC)"
	@cd apps/backend && npx tsx src/scripts/sync-database.ts
	@echo "$(GREEN)Database reset completed!$(NC)"

db-shell: ## Open PostgreSQL shell
	@echo "$(GREEN)Opening PostgreSQL shell...$(NC)"
	@docker exec -it itap-postgres-dev psql -U itap_user -d itap_dev

## Build and Test Commands

install: ## Install all dependencies
	@echo "$(GREEN)Installing dependencies...$(NC)"
	@pnpm install

build: ## Build all projects
	@echo "$(GREEN)Building all projects...$(NC)"
	@pnpm build

test: ## Run all tests
	@echo "$(GREEN)Running tests...$(NC)"
	@pnpm test

lint: ## Run linting
	@echo "$(GREEN)Running linting...$(NC)"
	@pnpm lint

typecheck: ## Run type checking
	@echo "$(GREEN)Running type checking...$(NC)"
	@pnpm typecheck

format: ## Format code
	@echo "$(GREEN)Formatting code...$(NC)"
	@pnpm format

## Status and Health Commands

status: ## Show status of all services
	@echo "$(GREEN)=== Service Status ====$(NC)"
	@echo "$(YELLOW)Docker Containers:$(NC)"
	@docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep itap || echo "No ITAP containers running"
	@echo ""
	@echo "$(YELLOW)Port Usage:$(NC)"
	@lsof -i :3001 2>/dev/null | head -2 || echo "Port 3001: Available"
	@lsof -i :5173 2>/dev/null | head -2 || echo "Port 5173: Available"
	@lsof -i :5432 2>/dev/null | head -2 || echo "Port 5432: Available"
	@lsof -i :6379 2>/dev/null | head -2 || echo "Port 6379: Available"

health: ## Check health of all services
	@echo "$(GREEN)=== Health Check ====$(NC)"
	@echo "$(YELLOW)Backend API:$(NC)"
	@curl -s http://localhost:3001/health | jq . 2>/dev/null || echo "Backend not responding"
	@echo "$(YELLOW)Frontend:$(NC)"
	@curl -s http://localhost:5173/ > /dev/null && echo "Frontend responding" || echo "Frontend not responding"
	@echo "$(YELLOW)Database:$(NC)"
	@docker exec itap-postgres-dev psql -U itap_user -d itap_dev -c "SELECT version();" 2>/dev/null | head -3 || echo "Database not responding"

## Utility Commands

restart: stop dev ## Restart all services

quick-start: ## Quick start for first-time setup
	@echo "$(GREEN)ITAP Quick Start$(NC)"
	@echo "$(YELLOW)1. Installing dependencies...$(NC)"
	@$(MAKE) install
	@echo "$(YELLOW)2. Starting infrastructure...$(NC)"
	@$(MAKE) infra
	@echo "$(YELLOW)3. Setting up database...$(NC)"
	@$(MAKE) db-sync
	@echo "$(YELLOW)4. Starting development environment...$(NC)"
	@$(MAKE) dev
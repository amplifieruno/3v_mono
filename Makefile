# =============================================================================
# ITAP Development Makefile
# =============================================================================

.PHONY: dev dev-compose hasura_apply prod prod-down prod-rebuild deploy \
	lint typecheck build test check-all \
	agent agent-safe agent-classic agent-resume agent-status agent-check \
	spec ship claude help

# =============================================================================
# Development
# =============================================================================

## Start Docker infrastructure
dev-compose:
	docker-compose --env-file .env.dev -f docker/docker-compose.dev.yml up -d

## Apply Hasura migrations and metadata
hasura_apply:
	docker compose --env-file .env.dev exec console \
		sh -c "hasura-cli metadata apply --endpoint=http://graphql:8080 && \
					 hasura-cli migrate apply --database-name 'default' --endpoint=http://graphql:8080"

## Start full development environment
dev:
	make dev-compose
	pnpm run dev

## Generate GraphQL types for admin-ui
gql:
	cd apps/admin-ui && pnpm gql

## Generate GraphQL types (watch mode)
gql-watch:
	cd apps/admin-ui && pnpm gql-w

# =============================================================================
# Quality Gates
# =============================================================================

## Run linter
lint:
	pnpm lint

## Run TypeScript type checking
typecheck:
	pnpm typecheck

## Build all packages
build:
	pnpm build

## Run all tests
test:
	pnpm test

## Run all quality checks
check-all: lint typecheck build
	@echo "All quality checks passed!"

# =============================================================================
# Production
# =============================================================================

## Start production stack
prod:
	docker-compose --env-file .env.prod -f docker/docker-compose.prod.yml up -d

## Stop production stack
prod-down:
	docker-compose --env-file .env.prod -f docker/docker-compose.prod.yml down

## Rebuild production stack
prod-rebuild:
	docker-compose --env-file .env.prod -f docker/docker-compose.prod.yml up -d --build --force-recreate

## Full production deployment
deploy:
	make prod-down
	git pull
	make prod-rebuild

# =============================================================================
# Agent Teams (Native Anthropic Feature)
# =============================================================================
# Uses Claude Code's native Agent Teams for parallel work coordination.
# Requires: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 in .claude/settings.json

WORKERS ?= 3
DELEGATE ?= true
TEAMMATE_MODE ?= tmux

## Check multi-agent prerequisites
agent-check:
	@echo "Checking multi-agent prerequisites..."
	@which claude > /dev/null 2>&1 || (echo "ERROR: claude CLI not found" && exit 1)
	@echo "  ok claude CLI"
	@which bd > /dev/null 2>&1 || (echo "ERROR: bd (beads) CLI not found" && exit 1)
	@echo "  ok bd CLI"
	@test -d .beads || (echo "ERROR: .beads not initialized. Run 'bd init'" && exit 1)
	@echo "  ok Beads initialized"
	@echo "All prerequisites met!"

## Show task status
agent-status:
	@echo "=== Task Status ==="
	@echo "Open:"
	@bd list -s open 2>/dev/null || echo "  (none)"
	@echo ""
	@echo "In Progress:"
	@bd list -s in_progress 2>/dev/null || echo "  (none)"
	@echo ""
	@echo "Ready:"
	@bd ready 2>/dev/null || echo "  (none)"

## Start agent team (GOAL required)
agent: agent-check
ifndef GOAL
	$(error GOAL is required. Usage: make agent GOAL="Add identity CRUD pages")
endif
	@echo "Starting Agent Team..."
	@echo "  Goal: $(GOAL)"
	@echo "  Workers: $(WORKERS)"
	@echo ""
	claude --dangerously-skip-permissions --teammate-mode $(TEAMMATE_MODE) \
		"Create an agent team to accomplish this goal: $(GOAL) \
		\
		Read .claude/AGENTS.md for role definitions. \
		Read CLAUDE.md for project context. \
		\
		Spawn $(WORKERS) worker teammates. \
		$(if $(filter true,$(DELEGATE)),Use delegate mode - focus on coordination only.) \
		\
		Workers should: \
		- Use bd for task tracking \
		- Run pnpm lint and pnpm typecheck before committing \
		\
		When done, clean up the team and push changes."

## Agent team with plan approval (safer for complex tasks)
agent-safe: agent-check
ifndef GOAL
	$(error GOAL is required. Usage: make agent-safe GOAL="Database migration")
endif
	@echo "Starting Agent Team (with plan approval)..."
	@echo "  Goal: $(GOAL)"
	@echo ""
	claude --dangerously-skip-permissions --teammate-mode $(TEAMMATE_MODE) \
		"Create an agent team for: $(GOAL) \
		\
		Read .claude/AGENTS.md for role definitions. \
		Read CLAUDE.md for project context. \
		\
		First, spawn a Planner teammate. \
		Require plan approval before they create tasks. \
		\
		After plan is approved, spawn $(WORKERS) Implementer teammates. \
		Use delegate mode - focus on coordination only. \
		\
		Workers should: \
		- Use bd for task tracking \
		- Run pnpm lint and pnpm typecheck before committing \
		\
		When done, clean up the team and push changes."

# =============================================================================
# Legacy Multi-Agent (Skill-based daemon)
# =============================================================================

MAX_CYCLES ?= 5
MAX_WORKERS ?= 5
CYCLE_TIMEOUT_MIN ?= 30
COMPLEXITY ?= medium

## Start multi-agent daemon (GOAL required)
agent-classic: agent-check
ifndef GOAL
	$(error GOAL is required. Usage: make agent-classic GOAL="Add logging")
endif
	@echo "Starting multi-agent daemon..."
	@echo "  Goal: $(GOAL)"
	@echo "  Max cycles: $(MAX_CYCLES)"
	@echo "  Max workers: $(MAX_WORKERS)"
	@echo ""
	claude --dangerously-skip-permissions \
		"Follow .claude/skills/multi-agent/SKILL.md \
		\
		GOAL: $(GOAL) \
		COMPLEXITY: $(COMPLEXITY) \
		MAX_CYCLES: $(MAX_CYCLES) \
		MAX_WORKERS: $(MAX_WORKERS) \
		CYCLE_TIMEOUT_MIN: $(CYCLE_TIMEOUT_MIN)"

## Resume multi-agent daemon (GOAL required)
START_CYCLE ?= 1
SESSION ?=
agent-resume: agent-check
ifndef GOAL
	$(error GOAL is required. Usage: make agent-resume GOAL="Add logging")
endif
ifdef SESSION
	claude --resume $(SESSION) --dangerously-skip-permissions
else
	claude --dangerously-skip-permissions \
		"Follow .claude/skills/multi-agent/SKILL.md \
		\
		GOAL: $(GOAL) \
		COMPLEXITY: $(COMPLEXITY) \
		RESUME: true \
		START_CYCLE: $(START_CYCLE) \
		MAX_CYCLES: $(MAX_CYCLES) \
		MAX_WORKERS: $(MAX_WORKERS) \
		CYCLE_TIMEOUT_MIN: $(CYCLE_TIMEOUT_MIN)"
endif

# =============================================================================
# Specifications & Shipping
# =============================================================================

## Ship: create summary + PR (TASK_DIR required)
DRAFT ?= true
GATES ?= false
ship: agent-check
ifndef TASK_DIR
	$(error TASK_DIR is required. Usage: make ship TASK_DIR="tasks/identity-crud")
endif
	@echo "Shipping..."
	@echo "  Task: $(TASK_DIR)"
	@echo "  Draft: $(DRAFT)"
	@echo ""
	claude --dangerously-skip-permissions --teammate-mode $(TEAMMATE_MODE) \
		"/ship TASK_DIR=\"$(TASK_DIR)\" DRAFT=$(DRAFT) GATES=$(GATES)"

## Start Claude with team mode
claude:
	claude --dangerously-skip-permissions --teammate-mode $(TEAMMATE_MODE)

# =============================================================================
# Help
# =============================================================================

## Show available commands
help:
	@echo "ITAP Development - Available Commands"
	@echo "======================================"
	@echo ""
	@echo "Development:"
	@echo "  dev              - Start full dev environment (Docker + servers)"
	@echo "  dev-compose      - Start Docker infrastructure only"
	@echo "  hasura_apply     - Apply Hasura migrations + metadata"
	@echo "  gql              - Generate GraphQL types"
	@echo "  gql-watch        - Generate GraphQL types (watch mode)"
	@echo ""
	@echo "Quality Gates:"
	@echo "  lint             - Run linter"
	@echo "  typecheck        - TypeScript type checking"
	@echo "  build            - Build all packages"
	@echo "  test             - Run all tests"
	@echo "  check-all        - Run all quality checks"
	@echo ""
	@echo "Production:"
	@echo "  prod             - Start production stack"
	@echo "  prod-down        - Stop production stack"
	@echo "  prod-rebuild     - Rebuild production stack"
	@echo "  deploy           - Full deployment"
	@echo ""
	@echo "Agent Teams:"
	@echo "  agent GOAL=...        - Start agent team"
	@echo "  agent-safe GOAL=...   - Agent team with plan approval"
	@echo "  agent-classic GOAL=.. - Legacy multi-agent daemon"
	@echo "  agent-resume GOAL=..  - Resume multi-agent daemon"
	@echo "  agent-status          - Show task status"
	@echo "  agent-check           - Check prerequisites"
	@echo "  claude                - Start Claude in team mode"
	@echo ""
	@echo "Shipping:"
	@echo "  ship TASK_DIR=...     - Generate summary + create PR"
	@echo ""

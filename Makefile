# HookTax top-level commands. Run `make help`.
# Targets are added as milestones land (index, arkiv-sync, web, sim, cre-sim, demo).

SHELL := /bin/bash
# Foundry installs to ~/.foundry/bin by default; make it visible to recipes.
export PATH := $(HOME)/.foundry/bin:$(PATH)

.DEFAULT_GOAL := help
.PHONY: help install doctor test index arkiv-keygen arkiv-plan arkiv-estimate arkiv-sync api

help: ## List available targets
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  %-12s %s\n", $$1, $$2}'

install: ## Install JS dependencies from the lockfile
	pnpm install --frozen-lockfile

doctor: ## Print toolchain versions and which config keys are set (never prints values)
	@echo "node   $$(node --version 2>/dev/null || echo MISSING)"
	@echo "pnpm   $$(pnpm --version 2>/dev/null || echo MISSING)"
	@echo "forge  $$(forge --version 2>/dev/null | head -n1 || echo MISSING)"
	@echo "anvil  $$(anvil --version 2>/dev/null | head -n1 || echo MISSING)"
	@[ -f .env ] || echo ".env   not found (run: cp .env.example .env), checking process env only"
	@for k in MAINNET_RPC_URL ARKIV_PRIVATE_KEY ARKIV_ACCESS_KEY REFRESH_API_TOKEN; do \
	  if [ -n "$${!k}" ]; then echo "config $$k: set (environment)"; \
	  elif [ -f .env ] && grep -qE "^$$k=.+" .env; then echo "config $$k: set (.env)"; \
	  else echo "config $$k: not set"; fi; \
	done

test: ## Run all unit tests (TypeScript packages)
	pnpm -r --if-present run test

index: ## M1: incremental mainnet import -> data/hooks.json, data/pools.json (read-only RPC)
	pnpm --filter @hooktax/indexer run index

arkiv-keygen: ## M2: create a TESTNET-ONLY Arkiv writer key in .env (prints the address only)
	pnpm --filter @hooktax/arkiv exec tsx src/keygen.ts

arkiv-plan: ## M2: read-only: what a sync would create/patch/extend on Arkiv
	pnpm --filter @hooktax/arkiv run sync --plan

arkiv-estimate: ## M2: unsigned gas estimate + projected tGLM cost (never signs)
	pnpm --filter @hooktax/arkiv run sync --estimate

arkiv-sync: ## M2: write HookAtlas to Arkiv (needs a funded ARKIV_PRIVATE_KEY)
	pnpm --filter @hooktax/arkiv run sync --write

api: ## M3: start the refresh API (POST /refresh) on API_PORT (default 8787)
	pnpm --filter @hooktax/api run start

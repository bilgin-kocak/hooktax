# HookTax top-level commands. Run `make help`.
# Targets are added as milestones land (index, arkiv-sync, web, sim, cre-sim, demo).

SHELL := /bin/bash
# Foundry installs to ~/.foundry/bin by default; make it visible to recipes.
export PATH := $(HOME)/.foundry/bin:$(PATH)

.DEFAULT_GOAL := help
.PHONY: help install doctor

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

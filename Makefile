# HookTax top-level commands. Run `make help`.
# Targets are added as milestones land (index, arkiv-sync, web, sim, cre-sim, demo).

SHELL := /bin/bash
# Foundry, bun and the cre CLI install to ~/.foundry/bin, ~/.bun/bin and ~/.cre/bin by default
# (their official installers); make them visible to recipes even before the shell is reloaded.
export PATH := $(HOME)/.foundry/bin:$(HOME)/.bun/bin:$(HOME)/.cre/bin:$(PATH)

.DEFAULT_GOAL := help
.PHONY: help install doctor test index arkiv-keygen arkiv-plan arkiv-estimate arkiv-sync api demo measure probe sim-build check atlas web cre-build cre-sim

help: ## List available targets
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  %-12s %s\n", $$1, $$2}'

install: ## Install everything: Foundry submodules, JS deps (lockfile), CRE workflow deps
	git submodule update --init --recursive
	pnpm install --frozen-lockfile
	@if command -v bun >/dev/null 2>&1; then cd cre/hooktax-refresh && bun install --frozen-lockfile; \
	else echo "bun not found: skipping CRE deps (only needed for make cre-build / cre-sim)"; fi

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

sim-build: ## Build the Foundry fork-simulation project (packages/sim)
	cd packages/sim && forge build

demo: ## M5: SneakyFeeHook worst case on a local mainnet fork: 0.3% today, 100% after the owner upgrades
	pnpm --filter @hooktax/sim run demo

measure: ## M4: measured take on real hooked pools on a fork (ARGS="--limit 12" to size the batch)
	pnpm --filter @hooktax/sim run measure $(ARGS)

probe: ## M5: real upgradeable swap-delta hooks: impersonate the upgrade authority on a fork, re-measure
	pnpm --filter @hooktax/sim run probe

check: ## M6: print the HookTax card for a pool or hook (ARG=0x...): make check ARG=0x<poolId|hook>
	pnpm --filter @hooktax/cli exec tsx src/bin.ts check $(ARG)

atlas: ## M6: one-line summary of the imported HookAtlas dataset
	pnpm --filter @hooktax/cli exec tsx src/bin.ts atlas

web: ## M2: run the HookAtlas web app (reads Arkiv directly) in dev mode
	pnpm --filter @hooktax/web run dev

cre-build: ## M3: compile the CRE workflow to WASM (no account needed)
	cd cre && cre workflow build hooktax-refresh --target staging-settings

cre-sim: ## M3: simulate the CRE workflow (needs `cre login` or CRE_API_KEY). Pass TX=0x.. EVENT=n
	cd cre && cre workflow simulate hooktax-refresh --target staging-settings --non-interactive --trigger-index 0 --evm-tx-hash $(TX) --evm-event-index $(EVENT)

# SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>
#
# SPDX-License-Identifier: MIT

PNPM ?= pnpm
NODE_MODULES_TSC := node_modules/.bin/tsc
# dprint's default cache is not accessible when using dsh-podman, so export a
# writable cache directory.
# keep the downloaded plugins inside the workspace instead.
export DPRINT_CACHE_DIR ?= $(CURDIR)/node_modules/.cache/dprint

.PHONY: all build typecheck lint test fmt fmt-check clean bump-version

all: build

# The JS build: host tsc, client tsc, then the esbuild browser bundle. Each
# target only calls the matching package.json script, which owns the command.
build: $(NODE_MODULES_TSC)
	$(PNPM) run build

typecheck: $(NODE_MODULES_TSC)
	$(PNPM) run typecheck

lint:
	$(PNPM) run lint

# Tests run against dist/, so build first.
test: build
	$(PNPM) test

fmt:
	$(PNPM) run fmt

fmt-check:
	$(PNPM) run fmt:check

# Bump package.json, commit the bump and create the tag. Requires a clean tree
# on master; nothing is pushed.
bump-version: $(NODE_MODULES_TSC)
	@test -n "$(VERSION)" || (echo "usage: make bump-version VERSION=x.y.z" >&2; exit 1)
	$(PNPM) bump-version $(VERSION)

$(NODE_MODULES_TSC): package.json pnpm-lock.yaml
	$(PNPM) install --frozen-lockfile

clean:
	rm -rf dist node_modules

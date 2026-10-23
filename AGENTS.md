<!--
SPDX-FileCopyrightText: 2026 Elouan Martinet <exa@elou.world>

SPDX-License-Identifier: MIT
-->

# AGENTS.md

Build, test, lint and format through `make`; the targets delegate to the
matching `package.json` scripts, so the scripts stay the single source of truth.

- `make build` — typecheck the host and client halves, then bundle the browser
  client with esbuild into `dist/client/index.js`
- `make typecheck` — `tsc --noEmit` for both halves
- `make lint` — oxlint over the TypeScript sources
- `make test` — build, then run the unit tests from `dist/`
- `make fmt` / `make fmt-check` — format / verify Markdown and TypeScript
- `make clean` — remove `dist/` and `node_modules/`
- `make bump-version VERSION=x.y.z` — run `pnpm bump-version`, which bumps,
  commits and tags; nothing is pushed

`pnpm test` runs against `dist/`, so run `pnpm build` first (or `make test`).
The Makefile exports `DPRINT_CACHE_DIR` because dprint's default cache is not
accessible when using dsh-podman.

## Manifest

The profile loads the bundle through `package.json`: `dsh.bundle.patch` points
at `cordis.patch.yml`, whose row `name` must equal the package name, and
`dsh.client.inject` lists only packages the checkout installs. The browser half
is published from the `./client` export.

## Storage

The host owns one KV domain over the harness storage hub: `layout: "single"`,
version 1, table `drafts`, record shape `DraftPromptRecord` in
`src/draft-prompts.ts`. The harness restricts unit names to `^[a-z][a-z0-9_]*$`
(the name is also a file-name segment), so the requested `draft-prompt` spelling
cannot be used on the medium; the unit is `draft_prompts`, stored at
`$DSH_HOME/storages/draft_prompts.json`. Keep the domain name and the
`draft-prompts` plugin identity distinct.

Writes that replace a record are compare-and-swap: the browser sends the whole
record it read, and the store refuses a mismatch with a conflict. Sent records
are frozen and never move; redrafting copies one into a new pending draft
ordered first. Pending drafts carry a fractional `order` and sort ascending by
it; sent records sort by `sentAt` descending, after every pending one.

## Browser transport and sending

The browser reaches the host only through `connection.fetch.register` at
`/api/draft-prompts` (see `src/draft-route.ts` and
`src/client/draft-client.ts`). The route is below `/api`, so the carrier has
already applied its Host/Origin fence and browser authentication. There is no
push channel: refetch when the tab opens, when the window regains focus, and
after every action.

A plan-mode draft sends the complete `/plan <text>` line through
`ctx.remote.commands.execute`, exactly as the `/plan` command does (it turns
plan mode on and steers the message). Every other draft goes through
`ctx.remote.session.prompt` with `mode: "queue"` and a client-minted request id,
so a double click cannot submit twice. The mapping is pure and tested in
`draftPromptSendTarget`.

Activation must never throw in the browser: `apply` captures its services and
guards each registration (`src/client/index.ts`), so a missing optional peer
only drops that one piece.

## Documentation

User-facing docs live in `README.md` and `README.zh.md`; development
instructions live only here. Users install the published package from npm — the
local build is for development only.

Markdown and TypeScript share one formatter — `dprint`, configured by
`dprint.json` (line width, wrapped-prose policy, pinned plugin versions, and the
formatted file set); run `make fmt`, and `make fmt-check` or the `js` CI job
verifies it. TypeScript is linted with `oxlint`, configured by `.oxlintrc.json`
and pinned in `devDependencies`: run `make lint`, which the `js` CI job also
runs.

## Conventions

- Work stays in one commit, `feat: initial version`; later changes amend it.
  Never push.
- Files carry SPDX headers; validate compliance with
  `REUSE_ENCODING_MODULE=chardet reuse lint` (the `REUSE_ENCODING_MODULE`
  variable works around a reuse bug that otherwise false-positives certain UTF-8
  files, e.g. the Chinese `.zh.md` docs). JSON, the lockfile and artwork are
  annotated in `REUSE.toml` instead.
- Every `@deepseek-ai/*` specifier is a caret range, in both `devDependencies`
  and `peerDependencies`, and every peer is optional. `src/package-deps.test.ts`
  derives the shared `@deepseek-ai/dsh-*` range from `engines.dsh` and enforces
  both rules.

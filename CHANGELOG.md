# Changelog

All notable changes to mcpmock will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- Update me using: markdown-toc -i CHANGELOG.md --maxdepth 2 -->
<!-- toc -->

- [[Unreleased]](#unreleased)
- [[1.1.2] - 2026-07-28](#112---2026-07-28)
- [[1.1.1] - 2026-07-28](#111---2026-07-28)
- [[1.1.0] - 2026-07-03](#110---2026-07-02)
- [[1.0.0] - 2026-07-02](#100---2026-07-02)
- [[1.0.0-rc.3] - 2026-07-02](#100-rc3---2026-07-02)
- [[1.0.0-rc1] - 2026-06-25](#100-rc1---2026-06-25)

<!-- tocstop -->

## [Unreleased]

### Fixed

- **Replay matching for `resources/read` is now URI-aware.** Recorded entries
  are keyed by concrete resource URI (`resources/read:<uri>`), enabling
  deterministic per-resource content replay (including template instances).
- **Matched replay errors are surfaced for `resources/read`.** A recorded
  `error` response is replayed as an error for the matching resource read,
  consistent with `tools/call` behavior.

### Changed

- **Replay authoring docs updated for method-specific matching rules.**
  `docs/authoring-replay-datasets.md` now documents `resources/read` URI-aware
  keys and method-specific argument extraction.

## [1.1.2] - 2026-07-28

### Fixed

- **Corrected CLI syntax across all user docs and the README.** `mcpmock run`
  takes the mcpdesc path as a positional argument (not `--mcpdesc`);
  `mcpmock record` uses `--upstream <url>` (not `--target`); `mcpmock import`
  uses `--execution-log <path> --output <path>` (not positional args).
- **Replaced non-existent `/health` readiness checks** in the CI/CD, HTTP, and
  getting-started guides with JSON-RPC `POST` probes — the mock HTTP server
  exposes no `/health` endpoint (any GET returns 405).
- **Fixed broken relative links** in `docs/` (removed erroneous `docs/` prefixes
  in GETTING_STARTED, corrected `../../` links to `extension/DEVELOPMENT.md` and
  the mcpmock `CHANGELOG.md`).
- **Replaced the deprecated `mcpcontract convert`** examples with the current
  `mcpcontract dump` command.
- **Corrected the getting-started mcpdesc example** to schema `0.7.0` with the
  `info` object (was `0.6.0` with a top-level `serverInfo`), and fixed the HTTP
  CORS header documentation to match the server's actual response.
- **Refreshed stale maintainer design docs.** Corrected
  `docs/maintainers/multi-version-schema-support.md` to the current single-version
  `0.7.0` semver registry (was the pre-0.10 URL-based `0.4.0` state), annotated
  `mcpmock-design.md` and `ping.md` as historical (they reference schema files
  that no longer exist), and fixed a stale URL-format schema example in
  `session-management.md`.

## [1.1.1] - 2026-07-28

### Added

- **docs/authoring-replay-datasets.md: new design-first guide for replay JSONL.**
  A precise, authoritative specification of the replay dataset format aimed at
  coding assistants that must generate a replay dataset from scratch using only
  a mcpdesc file as the source. Documents the `TrafficEntry` schema, JSONL
  rules, the full matching algorithm (composite key, exact argument hash,
  similarity scoring and threshold, Faker fallback, echoed request `id`),
  authoring pitfalls (unique `id`s, skipped `null` `id`s, stripped
  `_`-prefixed arguments), a worked success/error example, a step-by-step
  authoring procedure, and `jq` validation commands. Linked from the README
  Record Workflow and cross-linked with the recording tutorial.

### Fixed

- **docs/recording-traffic.md: corrected the replay JSONL format example.**
  Replaced the inaccurate single-line combined request/response example with the
  actual two-line format (separate `request` and `response` entries linked by a
  shared `id`), matching the recorder, importer, and replayer implementations.
- **docs/recording-traffic.md: fixed the `mcpmock run` replay invocation.**
  The mcpdesc path is a positional argument, not a `--mcpdesc` flag.
- **docs/recording-traffic.md: corrected the `mcpmock import` documentation.**
  Replaced the non-existent `mcpmock import traffic.jsonl mocks/` usage with the
  real command signature (`--execution-log <path> --output <path>`), which
  converts an mcptest execution log into replay JSONL.

## [1.1.0] - 2026-07-03

### Changed

- **Renamed npm package from `@cisco_open/mcpmock` to `@cisco_open/mcptoolkit-mock`.** This aligns with the convention across all mcptoolkit repos (contract, mock, test, editor)

## [1.0.0] - 2026-07-02

First stable release, graduating `1.0.0-rc.3`.

### Changed

- **README: added `## The MCP Description (\`mcpdesc\`) format` section.**
  Explains what an mcpdesc file is — borrowing the contract repo's phrasing
  ("portable, machine-readable contract ... much like OpenAPI does for REST
  APIs") — and points to
  [mcptoolkit-contract](https://github.com/cisco-open/mcptoolkit-contract) as
  the canonical source of truth for the specification, versioned schemas, and
  governance. Includes a `mcpcontract dump` one-liner to generate an mcpdesc.
  Placed between `## Quick Start` and `## Mock Data: Two Primary Workflows`,
  where users first encounter the format requirement.
- **docs/GETTING_STARTED.md: updated "Where to get mcpdesc files".**
  Replaced the pointer to the local vendored `schemas/mcpdesc-schema.json` with
  a link to the [MCP Description spec](https://github.com/cisco-open/mcptoolkit-contract/tree/main/spec)
  in mcptoolkit-contract — the authoritative source for the format.

## [1.0.0-rc.3] - 2026-07-02

### Added

- **`scripts/sync-badge.mjs`** — syncs the README status badge with the version
  in `package.json` automatically. Pre-release versions get an orange
  `pre-release` badge; stable versions get a `brightgreen` `release` badge.
- **`npm run sync-badge`** script and integrated into `npm run prerelease`
  (runs before link check, build, and tests).

### Changed

- **Version renamed from `1.0.0-rc1` to `1.0.0-rc.3`** — corrected to the
  standard semver pre-release dot convention; consistent with how
  `npm version prerelease --preid=rc` generates identifiers.
- **Added `publishConfig` and `files` to `package.json`.** `publishConfig:
  {access: "public"}` is required for scoped npm packages to publish publicly.
  `files` pins the npm tarball to `build/`, `schemas/`, `examples/`, `LICENSE`,
  and `README.md`.
- **Updated release process in `AGENTS.md` and `.github/skills/release/SKILL.md`.**
  Version bumps now use `npm version <target> --no-git-tag-version`, which
  atomically updates both `package.json` and `package-lock.json`. The old
  direct-to-`main` `git push --tags` flow is replaced with the branch/PR
  workflow (DCO sign-off required; tag pushed to `main` after the PR merges).
- Added `tests/check-doc-links.sh` and `npm run test:links` (was missing,
  causing `npm run prerelease` to fail).
- Upgraded TypeScript from 5.9.3 to 6.0.3.
- Upgraded `@types/node` from 20.x to 26.0.1 (the recommended version for TypeScript 6.0).
- Upgraded `commander` from 12.x to 15.x (ESM-only; requires Node.js ≥ 22.12.0).
- Dropped Node.js 20 (EOL April 2026); minimum supported version is now 22.12.0.
- Updated CI matrix from `[20.x, 22.x, 24.x]` to `[22.x, 24.x, 26.x]`.

### Fixed

- Added `"types": ["node"]` to `tsconfig.json` to explicitly declare Node.js
  type definitions, required by TypeScript 6.0's new default of `types: []`
  (previously all `@types/*` packages were auto-included).

## [1.0.0-rc1] - 2026-06-25

### Initial open-source release

First public release of **mcpmock** — the MCP mock server toolkit for testing,
development, and demos.

### Added

- **`mcpmock run`** — Start a mock MCP server from an mcpdesc file (generated by
  [mcpcontract](https://github.com/cisco-open/mcptoolkit-contract)).
  Supports stdio and HTTP transports, faker-based mock data generation, and
  file-based response overrides (`--data` directory).
- **`mcpmock record`** — Proxy and record real MCP traffic over HTTP to a JSONL
  file for later replay.
- **`mcpmock run --replay`** — Replay previously recorded JSONL traffic with
  configurable similarity-matching threshold (`--similarity-threshold`).
- **`mcpmock import`** — Convert mcptest execution logs to JSONL replay data,
  enabling a seamless test → mock workflow.
- **`mcpmock build`** — AI-assisted mock data builder with relationship detection
  between tool parameters; falls back to faker-based generation when offline.
  Integrates with the VS Code Copilot extension.
- **`mcpmock completion`** — Generate shell completion scripts for bash, zsh, and
  fish.
- **McpDesc schema v0.7.0** — Full validation support for the MCP Description
  format produced by mcpcontract.
- **In-memory caching** — Consistent mock responses within a server session.
- **Verbose logging** — Detailed stderr logging for all commands (`--verbose`).
- **Zero known vulnerabilities** — All dependencies audited; `npm audit` reports
  zero vulnerabilities.

---
name: oss-scaffold
description: 'Apply, check, and keep in sync the ObjectIsAdvantag open-source methodology (CI, tag-driven npm publish, governance, dependabot, repo settings) for a repository. Use to initialize a fresh repo (init), report drift and skill staleness (check), apply/update managed files (update), or audit GitHub repo settings (settings).'
argument-hint: 'A verb: init | check | update | settings'
---

# oss-scaffold skill

This skill carries the canonical open-source methodology and the concrete
artifacts that implement it. It is **vendored** into each repo at
`.github/skills/oss-scaffold/` and is versioned (see `VERSION`).

The methodology it enforces is documented in
[`artifacts/shared/OSS-PRACTICES.md`](artifacts/shared/OSS-PRACTICES.md) and
[`artifacts/shared/RELEASING.md`](artifacts/shared/RELEASING.md). Read those for
the "why"; this file is the operational "how".

## Core model

- **Managed files** (CI + publish workflows, dependabot, PR template, issue
  bug/feature templates) are byte-identical across repos and enforced by the
  **Scaffold Drift Check** CI job. Do not hand-edit them; edit upstream and
  re-vendor.
- **Templated files** (README, CONTRIBUTING, CHANGELOG, the release skill and
  release-manager agent, issue `config.yml`) keep local content between
  `<!-- scaffold:NAME:start -->` / `<!-- scaffold:NAME:end -->` markers, and may
  contain `{{placeholder}}` tokens. Only the marked regions are owned by the
  scaffold. The release skill/agent sync a core block (`scaffold:release-core`,
  `scaffold:release-agent`) while a project-specific section outside the markers
  is preserved — so repos add release steps (e.g. schema bumps) without an
  override.
- **Placeholders** in templated files are substituted by `apply.mjs` from
  `.scaffoldrc.json`: `{{owner}}`, `{{repoUrl}}`, `{{packageName}}`,
  `{{version}}`, `{{npmAuth}}`. Unresolved placeholders are reported and left
  as-is (never emptied).
- **`.scaffoldrc.json`** at the repo root records the `profile`, pinned scaffold
  `version`, `source`, `npmAuth` (`token` | `oidc`), `packageName`, `owner`,
  `repoUrl`, and any `overrides` (managed files intentionally opted out).
- **Profiles:** `node-npm-lib` (npm library), `node-cli` (adds bin/completions),
  `generic` (governance + settings only).

## Verbs

### Bootstrap — get the skill into a repo (prerequisite for `init`)

The scripts run from `.github/skills/oss-scaffold/`, so that directory must exist
in the target repo before any verb.

**Requires Node.js 18+** (for `npx`). Vendor from this repo at a tag:

```bash
# Copies just the skill directory at tag v0.2.0 into place (no git history).
npx degit ObjectIsAdvantag/oss-scaffold/skill/oss-scaffold#v0.2.0 \
  .github/skills/oss-scaffold
```

**No Node.js yet on this machine?** Use the git fallback:

```bash
git clone --depth 1 --branch v0.2.0 \
  https://github.com/ObjectIsAdvantag/oss-scaffold /tmp/oss-scaffold
cp -r /tmp/oss-scaffold/skill/oss-scaffold .github/skills/oss-scaffold
```

`update` re-runs the same vendoring command at a newer tag; `init` assumes it has
already happened.

### init — scaffold a fresh repo
1. Ensure the skill is vendored (see **Bootstrap** above); detect the
   language/registry and choose a profile (default `node-npm-lib` for npm
   libraries).
2. Ask the user for `npmAuth` (`oidc` preferred) and confirm the package name,
   `owner`, and `repoUrl`.
3. Write `.scaffoldrc.json` (with `source: github:ObjectIsAdvantag/oss-scaffold`
   and this skill's `version`).
4. Run `apply.mjs` to install managed + templated files and merge package
   scripts.
5. Ensure `CHANGELOG.md` (Keep a Changelog) and `LICENSE` exist; create if not.
6. Run `check.mjs` to confirm zero drift, then open a PR (`git commit -s`).
7. Run the `settings` verb to align GitHub repo settings.

### check — report drift and staleness (read-only)
- `node .github/skills/oss-scaffold/scripts/check.mjs` — offline: which managed
  files differ from the vendored artifacts.
- `node .github/skills/oss-scaffold/scripts/staleness.mjs` — online: whether a
  newer oss-scaffold version exists upstream.
- Summarize both; recommend `update` if anything is out of sync.

### update — apply fixes / re-vendor
- If the skill is stale, re-vendor `.github/skills/oss-scaffold/` from the source
  at the desired tag (same command as **Bootstrap**, with the newer tag) and
  bump `version` in `.scaffoldrc.json`.
- Run `apply.mjs` to restore managed files and refresh templated marker regions
  (local content outside markers is preserved).
- Run `check.mjs`; commit signed-off and open a PR. Never push to `main`
  directly.

### settings — audit GitHub repo configuration
- `node .github/skills/oss-scaffold/scripts/settings.mjs` audits merge strategy
  (merge-commit-only), Dependabot alerts + security updates, secret scanning +
  push protection, default branch, and branch protection.
- It first runs a **preflight**: it detects the repo host from the git remote
  (normalizing SSH aliases) and checks `gh auth status -h <host>`, failing early
  with actionable guidance when the GitHub API side isn't authenticated for that
  host. See the multi-account section in `OSS-PRACTICES.md`.
- It prints the exact `gh` commands for auto-fixable gaps and a manual checklist
  for admin/UI-only items. Prefer GitHub MCP tools if available.
- Apply auto-fixes **only after explicit user confirmation** (`--apply`). These
  change shared infrastructure and are hard to reverse.

## Guardrails
- Never commit to `main` directly; always branch + PR, DCO sign-off
  (`git commit -s`).
- Never overwrite content outside scaffold markers in templated files.
- Never flip GitHub settings without the user's explicit go-ahead.
- Respect `.scaffoldrc.json` `overrides` (e.g. org-mandated governance).

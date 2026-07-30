---
name: release
description: 'Cut a new npm release of this package. Use when preparing, tagging, or publishing a release (stable or release candidate) — bumping the version, updating CHANGELOG.md, opening a release PR, and driving the tag-triggered npm publish. Covers semantic versioning, DCO sign-off, branch/PR flow, and the next vs latest dist-tag policy for pre-releases.'
argument-hint: 'Target version, e.g. 1.0.0 or 1.0.0-rc.6'
---

<!--
  The block between the scaffold:release-core markers below is synced from
  oss-scaffold (github.com/ObjectIsAdvantag/oss-scaffold) — edit it upstream.
  Anything OUTSIDE the markers (front matter, and the "Project-specific release
  steps" section at the bottom) is yours: add repo-specific steps there and they
  survive `oss-scaffold update`.
-->

# Release Workflow

<!-- scaffold:release-core:start -->
Release this package safely: every release goes through a branch and PR, CI runs
on the branch, a maintainer reviews, the PR is merged to `main` with a **merge
commit**, and a `v*` tag on `main` triggers the automated npm publish.

## When to Use

- Cutting a stable release (`X.Y.Z`) or a release candidate (`X.Y.Z-rc.N`).
- Bumping the version and rolling up `CHANGELOG.md`.
- Any change that requires a new npm publish.

## Key Facts

- **Publish is tag-driven.** Pushing a tag matching `v*` triggers
  [`.github/workflows/publish.yml`](../../workflows/publish.yml), which builds,
  tests, checks doc links, verifies the tag matches `package.json`, and runs
  `npm publish --provenance --access public --tag <dist-tag>`.
- **Dist-tag policy is automatic.** Versions containing `-` (e.g. `1.0.0-rc.6`)
  publish under the `next` dist-tag; versions without `-` publish under
  `latest`. This keeps `npm install <package>` on the latest stable release while
  RCs are available via `@next`.
- **Tag must match `package.json`.** `publish.yml` fails if the pushed tag
  (minus the leading `v`) differs from the `version` field. Always bump
  `package.json` in the release PR.
- **DCO required.** Every commit must be signed off (`git commit -s`); see
  [CONTRIBUTING.md](../../../CONTRIBUTING.md).
- **Never release directly on `main`.** Use a branch and PR so CI runs and a
  reviewer can approve before publish.
- **Merge commit only.** The repo disables squash/rebase merging so the tagged
  SHA is exactly the reviewed, CI-green commit.

## Semantic Versioning

- **MAJOR (X.0.0)** — breaking changes.
- **MINOR (0.X.0)** — new features, backward-compatible.
- **PATCH (0.0.X)** — bug fixes, docs, non-breaking.
- **Pre-release** — append `-rc.N` (or `-beta.N`); these publish under `next`.

## Procedure

### 1. Prepare the release changes

1. Bump the version with `npm version` — this updates both `package.json` and
   `package-lock.json` atomically. Use `--no-git-tag-version` so npm doesn't
   create a commit or tag (those happen later, after the PR merges to `main`):
   ```bash
   # Set an exact version (e.g. first RC, or any explicit target)
   npm version 1.1.0-rc.1 --no-git-tag-version

   # Or let npm calculate the next pre-release bump
   npm version prerelease --preid=rc --no-git-tag-version

   # Or for a stable release
   npm version minor --no-git-tag-version
   ```
2. Update `CHANGELOG.md`: move items from `## [Unreleased]` into a new
   `## [X.Y.Z] - YYYY-MM-DD` section under the right headings (Added, Changed,
   Deprecated, Removed, Fixed, Security). Update the compare/anchor links. Leave
   an empty `[Unreleased]` section.
3. Complete any **project-specific release steps** (see the section at the bottom
   of this file).
4. Run the full pre-release gate and confirm it is green:
   ```bash
   npm run prerelease
   ```

### 2. Open the release PR

```bash
git switch main && git pull
git switch -c release/X.Y.Z

git add .
git commit -s -m "Release vX.Y.Z"

git push -u origin release/X.Y.Z
```

Open a PR against `main`. Wait for CI to pass and at least one maintainer
approval.

### 3. Merge, then tag on main

Merge the PR with a **merge commit** so the reviewed SHA lands in `main`.

```bash
git switch main && git pull
git tag vX.Y.Z
git push origin vX.Y.Z   # triggers publish.yml → npm
```

### 4. Verify the publish

```bash
npm view "$(node -p "require('./package.json').name")" dist-tags
# RC → should appear under "next"; stable → under "latest"
```

### 5. If publish fails

Do **not** force-push or delete a published tag. Fix forward with a new patch/RC
version and repeat the flow.

## Checklist

- [ ] Version bumped via `npm version <target> --no-git-tag-version` (updates both `package.json` and `package-lock.json`)
- [ ] `CHANGELOG.md` updated (new section + links + empty Unreleased)
- [ ] Project-specific release steps completed
- [ ] `npm run prerelease` green
- [ ] Branch `release/X.Y.Z` pushed, PR opened, commits DCO-signed
- [ ] CI green on the PR + maintainer approval
- [ ] PR merged with a merge commit
- [ ] `vX.Y.Z` tag pushed to `main`
- [ ] Publish workflow succeeded; correct dist-tag (`next` for RC, `latest` for stable)
<!-- scaffold:release-core:end -->

## Project-specific release steps

_No additional project-specific steps beyond the core workflow._

---

## AI Agent: Automated Release Workflow

**For Copilot or automated agents:** Use this workflow to automate the release process with validation and confirmation.

### Prerequisites

- You have commit access to the repository
- The repository is in a clean state (`git status` shows no uncommitted changes)
- All changes meant for this release are already merged to `main`

### Automated Workflow Steps

#### Step 1: Validate CHANGELOG.md State

1. Read `CHANGELOG.md`
2. Extract the latest released version from dated sections (e.g., `[1.2.1] - 2026-07-30`)
3. Check if the `[Unreleased]` section has any content (Added, Fixed, Changed, Removed, Deprecated, Security)
4. **STOP** if `[Unreleased]` has content:
   ```
   ⛔ CHANGELOG.md has unreleased changes under [Unreleased].
   These must be moved to a dated release section before proceeding.
   User must manually edit CHANGELOG.md first.
   ```
5. If valid, continue to Step 2

#### Step 2: Determine & Confirm Release Version

1. Calculate the default next version (patch bump of latest: e.g., 1.2.1 → 1.2.2)
2. Ask user: `"Confirm release version (default: X.Y.Z):"` 
3. Accept user input or default to calculated version
4. Validate the version matches semantic versioning (X.Y.Z or X.Y.Z-rcN format)
5. If invalid, ask user to provide a valid version

#### Step 3: Update CHANGELOG.md Automatically

1. Find the `## [Unreleased]` header
2. Insert a new dated release section immediately after it:
   ```markdown
   ## [Unreleased]

   ## [X.Y.Z] - YYYY-MM-DD

   ```
3. Use the current date in YYYY-MM-DD format
4. Add TOC entry if a `<!-- toc -->` block exists (add after `[Unreleased]` line)
5. Do NOT copy content from [Unreleased] — only move it if user explicitly had content there (caught in Step 1)

#### Step 4: Execute Version Bump

Run: `npm version <version> --no-git-tag-version`

Expected output: `vX.Y.Z`

If it fails, abort and show the error.

#### Step 5: Run Prerelease Validation

Run: `npm run prerelease`

This executes:
- `npm run sync-badge` (updates README.md)
- `npm run test:links` (validates all doc links)
- `npm run build` (TypeScript compilation)
- `npm test` (full test suite)

If ANY step fails, abort and show the error. Do NOT proceed.

#### Step 6: Report Status & Next Steps

Print a summary:

```
✅ Release v<version> prepared and validated

Files modified:
  • package.json (version bumped to <version>)
  • package-lock.json (regenerated)
  • CHANGELOG.md (new dated section added, [Unreleased] reset)
  • README.md (status badge synced to <version>)

All checks passing:
  ✅ Badge sync successful
  ✅ Documentation links valid
  ✅ TypeScript build successful
  ✅ All tests passing (82/82)

Ready to commit. Next steps (from AGENTS.md):

  1. Create release branch and commit (DCO sign-off required):
     git add .
     git commit -s -m "Release v<version>"
     git push -u origin release/<version>

  2. Open a PR to main, wait for review and CI green

  3. Merge PR with a merge commit

  4. Tag on main to trigger publish:
     git tag v<version>
     git push origin v<version>

  This triggers .github/workflows/publish.yml which runs npm publish with:
  • Dist-tag: "latest" (for X.Y.Z) or "next" (for X.Y.Z-rcN)
  • Provenance enabled
  • Access: public

Status: ✅ Files are ready; no commit made yet (user controls push to git)
```

### Error Handling

| Condition | Action |
|-----------|--------|
| `[Unreleased]` has content | ⛔ STOP. Tell user to finalize entries first. Do not proceed. |
| Invalid version format | ⛔ STOP. Ask user for X.Y.Z format. Do not run npm version. |
| `npm version` fails | ⛔ STOP. Show error. Do not proceed. |
| `npm run build` fails | ⛔ STOP. Show compilation errors. Do not run tests. |
| `npm test` fails | ⛔ STOP. Show test failures. Do not proceed to commit steps. |
| `npm run test:links` fails | ⛔ STOP. Show broken links. Do not proceed. |
| Git is not clean | ⛔ STOP before Step 3. Tell user to commit or stash changes first. |

### Example Invocation

User: `"I'm ready to release. Can you prepare the next release?"`

Agent:
1. Checks CHANGELOG.md for [Unreleased] content → passes
2. Extracts latest version (1.2.1) → calculates next (1.2.2)
3. Asks: "Confirm release version (default: 1.2.2):" → user enters or accepts
4. Updates CHANGELOG.md with new dated section
5. Runs `npm version 1.2.2 --no-git-tag-version` → ✅
6. Runs `npm run prerelease` → ✅ all checks pass
7. Prints summary with next steps

User then follows the git branch/commit/PR/tag steps to push to main and trigger publish.

---

**Related**: [AGENTS.md - Release Process](../../AGENTS.md), [CHANGELOG.md](../../CHANGELOG.md)

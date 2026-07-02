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

1. Bump `version` in `package.json` to the target version.
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

- [ ] `package.json` version bumped to target
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

<!--
  Add steps unique to this repo here (schema/version bumps, generated artifacts,
  docs sites, downstream sync, etc.). This section is NOT overwritten by
  oss-scaffold. If there are none, leave the note below.
-->

_No project-specific release steps. Follow the core workflow above._

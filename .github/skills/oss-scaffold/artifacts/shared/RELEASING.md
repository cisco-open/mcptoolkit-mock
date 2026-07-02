# Releasing

> Canonical release methodology for ObjectIsAdvantag open-source repositories.
> Distributed and kept in sync by
> [oss-scaffold](https://github.com/ObjectIsAdvantag/oss-scaffold). The
> repo-local, agent-facing version lives at
> `.github/skills/release/SKILL.md`.

<!-- scaffold:releasing:start -->
## Principles

1. **Every release is reviewed.** No release is cut directly on `main`. Changes
   land through a `release/X.Y.Z` branch and a pull request.
2. **The tag is the contract.** Publishing is triggered by pushing a `v*` tag to
   `main`. The tag points at the exact commit CI verified and a maintainer
   approved.
3. **Merge commits only.** Squash and rebase merging are disabled so the merged
   SHA — the one we tag and publish — is byte-for-byte what was reviewed.
4. **Automated, attested publish.** `publish.yml` builds, tests, verifies the
   tag matches `package.json`, and runs
   `npm publish --provenance --access public`.
5. **Fix forward, never rewrite.** A failed publish is fixed with a new
   patch/RC version — never by force-pushing or deleting a published tag.
6. **DCO always.** Every commit is signed off (`git commit -s`).

## Versioning (SemVer)

| Bump | When |
|------|------|
| MAJOR `X.0.0` | Breaking changes |
| MINOR `0.X.0` | New features, backward-compatible |
| PATCH `0.0.X` | Bug fixes, docs, non-breaking |
| Pre-release `-rc.N` / `-beta.N` | Release candidates |

## Dist-tag policy

- Versions **with** a `-` (e.g. `1.0.0-rc.6`) publish under **`next`**.
- Versions **without** a `-` publish under **`latest`**.

This keeps `npm install <package>` on the latest stable release while
pre-releases are available via `<package>@next`. The policy is enforced
automatically in `publish.yml`.

## The flow

```
feature branches ──PR──> main ──(release/X.Y.Z PR)──> merge commit ──tag vX.Y.Z──> publish.yml ──> npm
                          │                                                    │
                          └── CI (build+test matrix, doc-links, drift-check) ──┘
```

1. **Prepare** on `release/X.Y.Z`: bump `package.json`, roll `CHANGELOG.md`
   (`[Unreleased]` → `[X.Y.Z]`), run `npm run prerelease`.
2. **PR** against `main`; wait for green CI + maintainer approval.
3. **Merge** with a merge commit.
4. **Tag** the merged commit on `main` and push `vX.Y.Z` → triggers publish.
5. **Verify** the publish workflow and the dist-tag
   (`npm view <package> dist-tags`).
<!-- scaffold:releasing:end -->

## npm authentication

Two supported modes (chosen per repo in `.scaffoldrc.json → npmAuth`):

- **`oidc`** — npm Trusted Publishing; no long-lived token. **Preferred.**
- **`token`** — a repo `NPM_TOKEN` secret.

Both publish with `--provenance` and require `id-token: write`.

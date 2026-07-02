# Contributing

Thanks for your interest in contributing! This project follows a consistent
open-source workflow defined by
[oss-scaffold](https://github.com/ObjectIsAdvantag/oss-scaffold).

<!-- scaffold:contributing-dco:start -->
## Developer Certificate of Origin (DCO)

All contributions must be signed off under the
[Developer Certificate of Origin](https://developercertificate.org/). Sign off
each commit with:

```bash
git commit -s
```

This appends a `Signed-off-by: Your Name <your@email>` trailer certifying that
you wrote the change or have the right to submit it under the project's license.
Commits without a sign-off will fail the DCO check.
<!-- scaffold:contributing-dco:end -->

<!-- scaffold:contributing-workflow:start -->
## Workflow

1. Fork and create a feature branch off `main`.
2. Make your change with tests and documentation updates.
3. Add an entry under `## [Unreleased]` in `CHANGELOG.md`.
4. Run the local gate and ensure it passes:
   ```bash
   npm run prerelease
   ```
5. Open a pull request against `main`. CI must pass and a maintainer must
   approve before merge.

Releases are cut by maintainers via a branch + PR, then a `v*` tag on `main`
(see `RELEASING.md`). The repo merges PRs with a **merge commit** (squash and
rebase merging are disabled) so the tagged commit is exactly what was reviewed.
<!-- scaffold:contributing-workflow:end -->

## Code of Conduct

By participating you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

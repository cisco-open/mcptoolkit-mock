# OSS Practices

> Repository setup and management conventions for ObjectIsAdvantag open-source
> projects. Distributed and kept in sync by
> [oss-scaffold](https://github.com/ObjectIsAdvantag/oss-scaffold).

## Repository files

Every repo carries:

- `README.md`, `LICENSE` (Apache-2.0 unless noted), `CHANGELOG.md`
  (Keep a Changelog format).
- `CONTRIBUTING.md` (DCO), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1),
  `SECURITY.md`, `SUPPORT.md`.
- `.github/` — CI + publish workflows, `dependabot.yml`, PR + issue templates,
  the release skill and release-manager agent.
- `RELEASING.md` — the release methodology (see that file).
- `.github/skills/oss-scaffold/` — the vendored methodology skill (versioned).
- `.scaffoldrc.json` — profile, pinned scaffold version, overrides, package name.

## GitHub repository settings

Audited and enforced by the `oss-scaffold` agent's `settings` verb (proposes
`gh` commands; applies only on explicit confirmation):

### Merge strategy (critical)

- `allow_merge_commit = true`
- `allow_squash_merge = false`
- `allow_rebase_merge = false`

Squash/rebase create **new SHAs** at merge time that were never reviewed or
CI-verified, which breaks the tag-on-merge-commit release contract.

### Branch protection (`main`)

- Require a pull request before merging (≥ 1 approval).
- Require status checks to pass: CI build/test, doc-links, and **Scaffold Drift
  Check**.
- Require branches to be up to date before merging.
- Disallow force pushes and deletions.

### Security features

- Dependabot **alerts** + **security updates** enabled.
- **Secret scanning** + **push protection** enabled.
- Dependabot version updates via `.github/dependabot.yml` (low-noise: monthly,
  grouped minor/patch, cooldown; majors get individual PRs).

### Metadata

- Default branch `main`; description, topics, and license set.
- Actions enabled with `id-token` permitted (provenance / OIDC).

## Consistency model

- **Managed** files (CI + publish workflows, `dependabot.yml`, PR + issue bug/
  feature templates) are byte-identical across repos and enforced by the
  **Scaffold Drift Check** CI job. Editing them locally fails CI.
- **Templated** files (README, CONTRIBUTING, CHANGELOG, the **release skill and
  release-manager agent**, issue `config.yml`) keep local content between
  `<!-- scaffold:NAME:start -->` / `<!-- scaffold:NAME:end -->` markers or via
  `{{placeholder}}` values from `.scaffoldrc.json`; the scaffold owns only the
  marked regions. This lets a repo add project-specific release steps (e.g.
  schema bumps) after the synced core without an override.
- **Overrides** in `.scaffoldrc.json` let a repo intentionally opt a managed file
  out (e.g. org-mandated governance under a different org).

## Staying current

Run the `oss-scaffold` agent's `check` verb to see drift and whether the
vendored skill is behind the upstream source; `update` re-vendors and re-applies.

## Working across multiple GitHub accounts (git + gh)

Maintaining repos under several owners (a personal `github.com` account, one or
more orgs, and possibly an enterprise host) needs two **independent** things set
up correctly. They are often confused:

- **git transport (push/pull)** uses your **SSH keys** (or HTTPS credentials).
- **the `gh` CLI / GitHub API** (used by the `settings` verb, PR creation, etc.)
  uses **per-host OAuth tokens**, *not* your SSH keys.

Getting one working does not imply the other. The `settings` verb runs a
preflight `gh auth status -h <host>` and fails early if the API side isn't
authenticated for the repo's host.

### git: SSH host aliases + per-directory identity

Give each account its own key and an SSH host alias in `~/.ssh/config`:

```sshconfig
Host github.com-personal
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_personal
  IdentitiesOnly yes

Host github.com-work
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_work
  IdentitiesOnly yes
```

Clone (or set the remote) through the alias so the right key is used:

```bash
git remote set-url origin git@github.com-personal:owner/repo.git
```

Drive the commit identity (name/email) by directory with `includeIf` in
`~/.gitconfig`, so every repo under a tree gets the right author automatically:

```gitconfig
[includeIf "gitdir:~/repos/github.com/personal/"]
  path = ~/.gitconfig-personal
[includeIf "gitdir:~/repos/github.com/work/"]
  path = ~/.gitconfig-work
```

`settings.mjs` normalizes SSH aliases (`github.com-work` → `github.com`) when it
detects the host, so aliased remotes are handled.

### gh: per-host login + account switching

Authenticate `gh` once per host, then switch the active account per repo:

```bash
gh auth login -h github.com                 # add the account(s)
gh auth switch -h github.com -u <account>    # select the active one
gh auth status                              # verify
```

For a hands-off per-repo token, export `GH_TOKEN` scoped to a directory with
[direnv](https://direnv.net/) (`.envrc` → `export GH_TOKEN=…`). This is the
recommended setup for machines that juggle several accounts because it removes
the manual `gh auth switch`.

### Caveats

- A `GITHUB_ENTERPRISE_TOKEN`, `GH_TOKEN`, or `GITHUB_TOKEN` in the environment
  **overrides** interactive `gh` logins. A stale or wrong-host value silently
  shadows a good login — unset it if the `settings` preflight complains.
- `gh` picks the host from the repo's `origin` remote; an aliased SSH remote
  still resolves to the real host, but the matching `gh` login must exist.
- SSH working for `git push` tells you nothing about `gh`; check both.

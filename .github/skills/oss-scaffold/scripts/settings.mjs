#!/usr/bin/env node
// Managed by oss-scaffold. Audit GitHub repository settings against the
// methodology (OSS-PRACTICES.md). By default this is READ-ONLY: it reports gaps
// and prints the exact `gh` commands to fix them. Pass --apply to execute the
// mutations (the agent must obtain explicit user confirmation first).
//
// Requires the GitHub CLI (`gh`) authenticated with sufficient scope. Settings
// that need admin and aren't reachable are reported as a manual checklist.
//
// Usage:
//   node .github/skills/oss-scaffold/scripts/settings.mjs
//   node .github/skills/oss-scaffold/scripts/settings.mjs --apply
import { execFileSync } from 'node:child_process';

const apply = process.argv.includes('--apply');

function gh(args, { json = true } = {}) {
  const out = execFileSync('gh', args, { encoding: 'utf8' });
  return json ? JSON.parse(out) : out;
}
function tryGh(args, opts) {
  try {
    return { ok: true, data: gh(args, opts) };
  } catch (err) {
    return { ok: false, error: (err.stderr || err.message || '').toString().trim() };
  }
}

// --- Preflight: verify gh can talk to the right host BEFORE any API call. ---
// Multi-account setups (personal github.com + an enterprise host) are the common
// failure mode: gh may be authenticated to the enterprise host only, or a stale
// GITHUB_ENTERPRISE_TOKEN / GH_TOKEN env var may shadow a valid login. Detect
// the host from the git remote and check that specific host so we fail early
// with an actionable message instead of a confusing mid-run API error.
function remoteHost() {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], {
      encoding: 'utf8',
    }).trim();
    // SSH: git@host:owner/repo(.git)  |  git@host-alias:owner/repo
    const ssh = url.match(/@([^:]+):/);
    // HTTPS: https://host/owner/repo
    const https = url.match(/^https?:\/\/([^/]+)\//);
    let host = ssh ? ssh[1] : https ? https[1] : null;
    if (!host) return null;
    // Normalize SSH host aliases (e.g. github.com-work → github.com).
    if (host.startsWith('github.com')) host = 'github.com';
    return host;
  } catch {
    return null;
  }
}

const host = remoteHost();
if (host) {
  const status = tryGh(['auth', 'status', '-h', host], { json: false });
  if (!status.ok) {
    console.error(`gh is not authenticated for "${host}".`);
    console.error('The settings audit talks to the GitHub API and needs a valid');
    console.error(`login for the repo's host. Fix one of:`);
    console.error(`  • gh auth login -h ${host}`);
    console.error(`  • gh auth switch -h ${host} -u <account>   (if already logged in)`);
    if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_ENTERPRISE_TOKEN) {
      console.error('  • a GH_TOKEN / GITHUB_TOKEN / GITHUB_ENTERPRISE_TOKEN env var is set —');
      console.error('    unset it if it points at the wrong host or is expired.');
    }
    console.error('\nDetails:');
    console.error(status.error);
    process.exit(2);
  }
}

// Resolve owner/repo from the gh context.
const ctx = tryGh(['repo', 'view', '--json', 'nameWithOwner,defaultBranchRef']);
if (!ctx.ok) {
  console.error('Could not determine the repo via `gh repo view`. Is gh installed and authenticated?');
  console.error(ctx.error);
  process.exit(2);
}
const nameWithOwner = ctx.data.nameWithOwner;
const [owner, repo] = nameWithOwner.split('/');
const defaultBranch = ctx.data.defaultBranchRef?.name;

const gaps = [];
const manual = [];
function propose(label, fixArgs) {
  gaps.push({ label, fixArgs });
}

// 1. Merge strategy: merge commits only.
const repoInfo = tryGh(['api', `repos/${owner}/${repo}`]);
if (repoInfo.ok) {
  const r = repoInfo.data;
  const want = { allow_merge_commit: true, allow_squash_merge: false, allow_rebase_merge: false };
  const bad = Object.entries(want).filter(([k, v]) => r[k] !== v);
  if (bad.length) {
    propose(
      `Merge strategy should be merge-commit-only (${bad.map(([k]) => k).join(', ')})`,
      ['api', '--method', 'PATCH', `repos/${owner}/${repo}`,
        '-F', 'allow_merge_commit=true',
        '-F', 'allow_squash_merge=false',
        '-F', 'allow_rebase_merge=false']
    );
  }
  if (defaultBranch && defaultBranch !== 'main') {
    manual.push(`Default branch is "${defaultBranch}"; rename to "main" (Settings → Branches).`);
  }
} else {
  manual.push('Read repo settings (merge strategy, default branch) — needs access: ' + repoInfo.error);
}

// 2. Vulnerability alerts + automated security fixes.
const alerts = tryGh(['api', `repos/${owner}/${repo}/vulnerability-alerts`, '--silent'], { json: false });
if (!alerts.ok) {
  propose('Dependabot vulnerability alerts should be enabled',
    ['api', '--method', 'PUT', `repos/${owner}/${repo}/vulnerability-alerts`]);
}
const autofix = tryGh(['api', `repos/${owner}/${repo}/automated-security-fixes`]);
if (!autofix.ok || autofix.data?.enabled !== true) {
  propose('Dependabot security updates should be enabled',
    ['api', '--method', 'PUT', `repos/${owner}/${repo}/automated-security-fixes`]);
}

// 3. Secret scanning + push protection.
if (repoInfo.ok) {
  const sa = repoInfo.data.security_and_analysis ?? {};
  if (sa.secret_scanning?.status !== 'enabled') {
    propose('Secret scanning should be enabled',
      ['api', '--method', 'PATCH', `repos/${owner}/${repo}`,
        '-F', 'security_and_analysis[secret_scanning][status]=enabled']);
  }
  if (sa.secret_scanning_push_protection?.status !== 'enabled') {
    propose('Secret scanning push protection should be enabled',
      ['api', '--method', 'PATCH', `repos/${owner}/${repo}`,
        '-F', 'security_and_analysis[secret_scanning_push_protection][status]=enabled']);
  }
}

// 4. Branch protection on main (read may need admin).
const prot = tryGh(['api', `repos/${owner}/${repo}/branches/main/protection`]);
if (!prot.ok) {
  manual.push(
    'Configure branch protection on `main` (Settings → Branches): require a PR ' +
    'with ≥1 approval; require status checks "Build & Test", "Documentation Link ' +
    'Check", "Scaffold Drift Check"; require up-to-date branches; disallow force ' +
    'pushes and deletions.'
  );
} else {
  const p = prot.data;
  const checks = p.required_status_checks?.contexts ?? [];
  const needed = ['Scaffold Drift Check'];
  const missing = needed.filter((c) => !checks.some((x) => x.includes('Drift')));
  if (!p.required_pull_request_reviews) manual.push('Require pull request reviews on `main`.');
  if (missing.length) manual.push(`Add required status check(s) on \`main\`: ${missing.join(', ')}.`);
  if (p.allow_force_pushes?.enabled) manual.push('Disable force pushes on `main`.');
}

// Report.
console.log(`Repo settings audit for ${nameWithOwner}\n`);
if (gaps.length === 0 && manual.length === 0) {
  console.log('All audited settings conform to the methodology. ✓');
  process.exit(0);
}

if (gaps.length) {
  console.log(`Auto-fixable via gh (${gaps.length}):`);
  for (const g of gaps) {
    console.log(`  - ${g.label}`);
    console.log(`      gh ${g.fixArgs.map((a) => (a.includes(' ') ? `'${a}'` : a)).join(' ')}`);
  }
}
if (manual.length) {
  console.log(`\nNeeds manual / admin action (${manual.length}):`);
  for (const m of manual) console.log(`  - ${m}`);
}

if (apply && gaps.length) {
  console.log('\n--apply: executing auto-fixes...');
  for (const g of gaps) {
    const res = tryGh(g.fixArgs, { json: false });
    console.log(`  ${res.ok ? '✓' : '✗'} ${g.label}${res.ok ? '' : ' — ' + res.error}`);
  }
} else if (gaps.length) {
  console.log('\nRe-run with --apply to execute the auto-fixes (after confirming).');
}

#!/usr/bin/env node
// Managed by oss-scaffold. Report whether the vendored skill is behind the
// upstream oss-scaffold source. Compares the local skill VERSION against the
// latest SemVer tag of the source repo (via `git ls-remote`).
//
// Usage: node .github/skills/oss-scaffold/scripts/staleness.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { SKILL_DIR, loadConfig } from './lib.mjs';

function sourceUrl(source) {
  // Accept "github:owner/repo" or a full https/git URL.
  const m = /^github:(.+)$/.exec(source ?? '');
  if (m) return `https://github.com/${m[1]}.git`;
  return source;
}

function cmp(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

const cfg = loadConfig();
const local = readFileSync(join(SKILL_DIR, 'VERSION'), 'utf8').trim();
const url = sourceUrl(cfg.source);

if (!url) {
  console.log('No "source" in .scaffoldrc.json; cannot check staleness.');
  process.exit(0);
}

let latest = null;
try {
  const out = execFileSync('git', ['ls-remote', '--tags', '--refs', url], {
    encoding: 'utf8',
  });
  const versions = out
    .split('\n')
    .map((l) => l.split('/').pop())
    .filter((t) => /^v\d+\.\d+\.\d+$/.test(t || ''))
    .map((t) => t.slice(1))
    .sort(cmp);
  latest = versions.at(-1) ?? null;
} catch (err) {
  console.log(`Could not reach ${url}: ${err.message}`);
  process.exit(0);
}

console.log(`Vendored skill: ${local}`);
console.log(`Upstream latest: ${latest ?? '(none found)'}`);
if (latest && cmp(latest, local) > 0) {
  console.log(
    `\nA newer oss-scaffold (${latest}) is available. Re-vendor with the agent's ` +
      '`update` verb (or copy skill/ from the source at that tag) and re-run apply.mjs.'
  );
} else {
  console.log('\nVendored skill is up to date. ✓');
}

#!/usr/bin/env node
// Managed by oss-scaffold. Offline drift check: managed files in the repo must
// match the vendored artifacts byte-for-byte (excluding declared overrides).
//
// Usage:
//   node .github/skills/oss-scaffold/scripts/check.mjs          # report, exit 0
//   node .github/skills/oss-scaffold/scripts/check.mjs --ci     # fail on drift
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  REPO_ROOT,
  loadManifest,
  loadConfig,
  resolveProfile,
  srcFor,
  artifactPath,
} from './lib.mjs';

const ci = process.argv.includes('--ci');

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

const cfg = loadConfig();
const manifest = loadManifest();
const { managed } = resolveProfile(manifest, cfg.profile);

const drift = [];
const missing = [];
const ok = [];

for (const entry of managed) {
  if (cfg.overrides.includes(entry.dest)) continue;
  const src = srcFor(entry, cfg);
  const expected = read(artifactPath(src));
  if (expected == null) {
    drift.push(`${entry.dest} (missing source artifact ${src})`);
    continue;
  }
  const actual = read(join(REPO_ROOT, entry.dest));
  if (actual == null) {
    missing.push(entry.dest);
  } else if (actual !== expected) {
    drift.push(entry.dest);
  } else {
    ok.push(entry.dest);
  }
}

console.log(`oss-scaffold drift check — profile "${cfg.profile}", npmAuth "${cfg.npmAuth}"`);
console.log(`  in sync: ${ok.length}`);
if (missing.length) {
  console.log(`  missing: ${missing.length}`);
  for (const d of missing) console.log(`    - ${d}`);
}
if (drift.length) {
  console.log(`  drifted: ${drift.length}`);
  for (const d of drift) console.log(`    - ${d}`);
}

const problems = missing.length + drift.length;
if (problems === 0) {
  console.log('All managed files match the vendored oss-scaffold. ✓');
  process.exit(0);
}

console.log(
  `\n${problems} managed file(s) differ from oss-scaffold. Run:\n` +
    '  node .github/skills/oss-scaffold/scripts/apply.mjs\n' +
    'to restore them (or add an intentional exception to .scaffoldrc.json "overrides").'
);
process.exit(ci ? 1 : 0);

#!/usr/bin/env node
/**
 * Syncs the README status badge with the version in package.json.
 *
 * - Pre-release versions (containing "-", e.g. "1.0.0-rc.3") → orange badge labeled "pre-release"
 * - Stable versions (e.g. "1.0.0") → brightgreen badge labeled "release"
 *
 * shields.io badge URL encodes "-" as "--", so the version is escaped accordingly.
 */
import { readFileSync, writeFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const version = pkg.version;

const isPreRelease = version.includes('-');
const color = isPreRelease ? 'orange' : 'brightgreen';
const label = isPreRelease ? 'pre-release' : 'release';
const badgeVersion = version.replace(/-/g, '--');

const badge = `[![Status: ${label}](https://img.shields.io/badge/status-${badgeVersion}-${color}.svg)](CHANGELOG.md)`;

const BADGE_RE = /\[!\[Status:[^\]]*\]\(https:\/\/img\.shields\.io\/badge\/status-[^)]+\)\]\(CHANGELOG\.md\)/;

const readme = readFileSync('README.md', 'utf8');

if (!BADGE_RE.test(readme)) {
  console.error('No status badge found in README.md – nothing updated.');
  process.exit(1);
}

const updated = readme.replace(BADGE_RE, badge);

if (updated === readme) {
  console.log(`Status badge already up to date (${version})`);
} else {
  writeFileSync('README.md', updated, 'utf8');
  console.log(`Status badge updated → ${version} (${label})`);
}

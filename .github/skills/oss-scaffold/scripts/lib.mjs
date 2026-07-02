// Managed by oss-scaffold. Shared helpers for the vendored skill scripts.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// scripts/ -> skill dir -> repo root (.github/skills/oss-scaffold/scripts)
export const SKILL_DIR = resolve(__dirname, '..');
export const REPO_ROOT = resolve(SKILL_DIR, '..', '..', '..');
export const ARTIFACTS = join(SKILL_DIR, 'artifacts');

export function readJSON(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadManifest() {
  return readJSON(join(SKILL_DIR, 'MANIFEST.json'));
}

export function loadConfig() {
  const path = join(REPO_ROOT, '.scaffoldrc.json');
  if (!existsSync(path)) {
    throw new Error(
      'Missing .scaffoldrc.json at repo root. Run the oss-scaffold agent `init` first.'
    );
  }
  const cfg = readJSON(path);
  cfg.overrides ??= [];
  cfg.npmAuth ??= 'token';
  return cfg;
}

// Resolve the full managed + templated entry list for a profile, following
// `extends`. Later profiles override earlier ones by `dest`.
export function resolveProfile(manifest, profileName) {
  const chain = [];
  let name = profileName;
  const seen = new Set();
  while (name) {
    if (seen.has(name)) throw new Error(`Cyclic profile extends: ${name}`);
    seen.add(name);
    const p = manifest.profiles[name];
    if (!p) throw new Error(`Unknown profile: ${name}`);
    chain.unshift(p);
    name = p.extends;
  }
  const managed = new Map();
  const templated = new Map();
  let packageScripts = null;
  for (const p of chain) {
    for (const e of p.managed ?? []) managed.set(e.dest, e);
    for (const e of p.templated ?? []) templated.set(e.dest, e);
    if (p.packageScripts) packageScripts = p.packageScripts;
  }
  return {
    managed: [...managed.values()],
    templated: [...templated.values()],
    packageScripts,
  };
}

// Pick the source artifact for a managed entry, honoring `variants`.
export function srcFor(entry, cfg) {
  if (entry.src) return entry.src;
  if (entry.variants) {
    for (const [key, byValue] of Object.entries(entry.variants)) {
      const value = cfg[key] ?? entry.default;
      if (byValue[value]) return byValue[value];
    }
  }
  if (entry.default && entry.variants) {
    const first = Object.values(entry.variants)[0];
    if (first[entry.default]) return first[entry.default];
  }
  throw new Error(`Cannot resolve source for ${entry.dest}`);
}

export function artifactPath(src) {
  return join(ARTIFACTS, src);
}

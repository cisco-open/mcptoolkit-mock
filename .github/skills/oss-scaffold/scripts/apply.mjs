#!/usr/bin/env node
// Managed by oss-scaffold. Apply the methodology to the current repo:
//  - overwrite managed files with the vendored artifacts (byte-identical),
//  - for templated files, replace only the <!-- scaffold:NAME:start/end -->
//    regions (create the file whole if it does not exist),
//  - ensure the profile's package.json scripts are present.
// Respects .scaffoldrc.json "overrides" (skips those dest paths).
//
// Usage:
//   node .github/skills/oss-scaffold/scripts/apply.mjs            # write changes
//   node .github/skills/oss-scaffold/scripts/apply.mjs --dry-run  # preview only
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  REPO_ROOT,
  SKILL_DIR,
  loadManifest,
  loadConfig,
  resolveProfile,
  srcFor,
  artifactPath,
  readJSON,
} from './lib.mjs';

const dryRun = process.argv.includes('--dry-run');
const changes = [];

function read(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}
function write(destRel, content) {
  const dest = join(REPO_ROOT, destRel);
  if (read(dest) === content) return false;
  if (!dryRun) {
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content);
  }
  changes.push(destRel);
  return true;
}

// Substitute {{placeholder}} tokens in templated content from .scaffoldrc.json.
// Unknown or empty values are left as-is (and reported) so nothing silently
// renders to an empty string.
const unresolved = new Set();
function render(text, cfg) {
  const map = {
    owner: cfg.owner ?? '',
    repoUrl: cfg.repoUrl ?? '',
    packageName: cfg.packageName ?? '',
    version: cfg.version ?? '',
    npmAuth: cfg.npmAuth ?? '',
  };
  return text.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (k in map && map[k] !== '') return map[k];
    unresolved.add(k);
    return m;
  });
}

// Replace each <!-- scaffold:NAME:start -->...<!-- scaffold:NAME:end --> block
// in `target` with the matching block from `source`.
function mergeMarkers(source, target) {
  const re = /<!-- scaffold:([\w-]+):start -->[\s\S]*?<!-- scaffold:\1:end -->/g;
  const blocks = new Map();
  let m;
  while ((m = re.exec(source)) !== null) blocks.set(m[1], m[0]);
  let out = target;
  for (const [name, block] of blocks) {
    const tRe = new RegExp(
      `<!-- scaffold:${name}:start -->[\\s\\S]*?<!-- scaffold:${name}:end -->`
    );
    if (tRe.test(out)) out = out.replace(tRe, block);
  }
  return out;
}

const cfg = loadConfig();
const manifest = loadManifest();
const { managed, templated, packageScripts } = resolveProfile(manifest, cfg.profile);

// 1. Managed files — overwrite verbatim.
for (const entry of managed) {
  if (cfg.overrides.includes(entry.dest)) continue;
  const content = readFileSync(artifactPath(srcFor(entry, cfg)), 'utf8');
  write(entry.dest, content);
}

// 2. Templated files — whole-file if missing, else merge marker regions.
//    Placeholders are rendered from .scaffoldrc.json before writing.
for (const entry of templated) {
  if (cfg.overrides.includes(entry.dest)) continue;
  const source = render(readFileSync(artifactPath(entry.src), 'utf8'), cfg);
  const existing = read(join(REPO_ROOT, entry.dest));
  if (existing == null) {
    if (entry.optOut) continue; // don't create opt-out governance unless present
    write(entry.dest, source);
  } else {
    write(entry.dest, mergeMarkers(source, existing));
  }
}

// 3. package.json scripts — add any that are missing.
if (packageScripts) {
  const pkgPath = join(REPO_ROOT, 'package.json');
  if (existsSync(pkgPath)) {
    const frag = readJSON(artifactPath(packageScripts));
    const pkg = readJSON(pkgPath);
    pkg.scripts ??= {};
    let touched = false;
    const warn = [];
    for (const [k, v] of Object.entries(frag.scripts ?? {})) {
      if (!(k in pkg.scripts)) {
        pkg.scripts[k] = v;
        touched = true;
      } else if (pkg.scripts[k] !== v) {
        warn.push(k);
      }
    }
    if (touched && !dryRun) {
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    }
    if (touched) changes.push('package.json (scripts)');
    for (const k of warn) {
      console.log(`  note: package.json script "${k}" differs from the profile default — left as-is.`);
    }
  }
}

if (unresolved.size) {
  console.log(
    `  note: unresolved placeholder(s) left as-is: ${[...unresolved]
      .map((k) => `{{${k}}}`)
      .join(', ')}. Add them to .scaffoldrc.json.`
  );
}
console.log(`Applied oss-scaffold (skill ${read(join(SKILL_DIR, 'VERSION'))?.trim()})`);
if (changes.length === 0) {
  console.log('Nothing to change — repo already matches. ✓');
} else {
  console.log(`${dryRun ? 'Would change' : 'Changed'} ${changes.length} file(s):`);
  for (const c of changes) console.log(`  - ${c}`);
  if (!dryRun) console.log('\nReview, commit (git commit -s), and open a PR.');
}

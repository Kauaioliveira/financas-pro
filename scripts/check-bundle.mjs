#!/usr/bin/env node
// Guards the built site before it is published.
//
//   node scripts/check-bundle.mjs [dir] [--expect-local]
//
// Always fails when the output contains a Supabase key that bypasses Row Level
// Security: a secret key value (sb_secret_...) or a legacy JWT whose role is
// service_role. Mentions of the words in code (supabase-js itself checks key
// prefixes) are not keys and do not fail.
// With --expect-local (CI), also fails when the local build contains cloud code.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const TEXT_FILE = /\.(js|mjs|cjs|html|css|json|map|txt|webmanifest)$/i;
const SECRET_KEY = /sb_secret_[A-Za-z0-9_-]{16,}/g;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const CLOUD_MARKERS = ['supabase-js', 'rotate_vault_keys'];

/** Findings for one file's content: kinds of secrets, each with a masked sample. */
export function findSecrets(content) {
  const findings = [];
  for (const match of content.match(SECRET_KEY) ?? []) {
    findings.push({ kind: 'sb_secret', sample: `${match.slice(0, 14)}...` });
  }
  for (const match of content.match(JWT) ?? []) {
    try {
      const payload = JSON.parse(Buffer.from(match.split('.')[1], 'base64url').toString('utf8'));
      if (payload && payload.role === 'service_role') {
        findings.push({ kind: 'service_role JWT', sample: `${match.slice(0, 14)}...` });
      }
    } catch {
      // not a JWT after all
    }
  }
  return findings;
}

export function findCloudCode(content) {
  return CLOUD_MARKERS.filter(marker => content.includes(marker));
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(entry => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );
  return files.flat();
}

export async function checkBundle(dir, { expectLocal = false } = {}) {
  const problems = [];
  for (const file of await listFiles(dir)) {
    if (!TEXT_FILE.test(file)) continue;
    const content = await readFile(file, 'utf8');
    const name = relative(dir, file);
    for (const finding of findSecrets(content)) {
      problems.push(`${name}: chave ${finding.kind} (${finding.sample})`);
    }
    if (expectLocal) {
      for (const marker of findCloudCode(content)) {
        problems.push(`${name}: código de nuvem no build local ("${marker}")`);
      }
    }
  }
  return problems;
}

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  const args = process.argv.slice(2);
  const dir = args.find(arg => !arg.startsWith('--')) ?? 'dist';
  const problems = await checkBundle(dir, { expectLocal: args.includes('--expect-local') });
  if (problems.length > 0) {
    console.error(`check-bundle: ${problems.length} problema(s) em ${dir}:`);
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('Nunca publique sb_secret_ nem service_role: use a Publishable key em VITE_SUPABASE_ANON_KEY.');
    process.exit(1);
  }
  console.log(`check-bundle: ${dir} ok${args.includes('--expect-local') ? ' (sem código de nuvem)' : ''}.`);
}

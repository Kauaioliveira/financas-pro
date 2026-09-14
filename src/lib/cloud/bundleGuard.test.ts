import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkBundle, findCloudCode, findSecrets } from '../../../scripts/check-bundle.mjs';

// Built at runtime so this file never contains anything shaped like a real key.
const fakeSecret = ['sb', 'secret', 'AbCdEfGhIjKlMnOpQrStUv123456'].join('_');
const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (payload: object) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.c2lnbmF0dXJlLXZhbHVl`;

describe('check-bundle guard', () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
  });

  async function dist(files: Record<string, string>): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'financaspro-bundle-'));
    dirs.push(dir);
    await mkdir(join(dir, 'assets'));
    for (const [name, content] of Object.entries(files)) await writeFile(join(dir, name), content);
    return dir;
  }

  it('finds secret key values and service_role JWTs, masked', () => {
    const found = findSecrets(`const a="${fakeSecret}";const b="${jwt({ role: 'service_role', iss: 'supabase' })}"`);
    expect(found.map((f: { kind: string }) => f.kind)).toEqual(['sb_secret', 'service_role JWT']);
    expect(JSON.stringify(found)).not.toContain(fakeSecret);
  });

  it('ignores the words in code and publishable/anon keys (edge: supabase-js checks prefixes)', () => {
    expect(findSecrets('e.startsWith(`sb_secret_`);/"role"\\s*:\\s*"service_role"/.test(x)')).toEqual([]);
    expect(findSecrets(`"sb_publishable_abc123def456ghi789" "${jwt({ role: 'anon' })}"`)).toEqual([]);
  });

  it('fails a build that contains a secret and, for local builds, cloud code', async () => {
    const clean = await dist({ 'index.html': '<script src="/assets/index.js"></script>', 'assets/index.js': 'console.log(1)' });
    expect(await checkBundle(clean, { expectLocal: true })).toEqual([]);

    const leaked = await dist({ 'assets/index.js': `const key="${fakeSecret}"` });
    expect(await checkBundle(leaked)).toHaveLength(1);

    const cloud = await dist({ 'assets/chunk.js': 'const info="supabase-js/2.116.0"' });
    expect(await checkBundle(cloud)).toEqual([]);
    expect(findCloudCode('supabase-js/2.116.0')).toEqual(['supabase-js']);
    expect(await checkBundle(cloud, { expectLocal: true })).toHaveLength(1);
  });
});

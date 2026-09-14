import { describe, expect, it, vi } from 'vitest';
import {
  detectBackupFormat,
  exportBackupV2,
  importBackupV2,
  importEncryptedBackup,
  importPlainBackup,
  readBackupV2Info,
} from './backup';
import {
  addRecoveryWrap,
  createRecoveryKitWrap,
  createVaultEnvelope,
  encryptBackup,
  generateDataKeyAsync,
  rotateVaultKey,
} from '../lib/crypto';
import legacyFixture from '../test/fixtures/legacy-v1.json';

// Wraps record their iteration count, so a low count exercises the same paths.
// The real 310k format is covered in src/lib/auth/legacyAccount.test.ts.
vi.mock('../lib/crypto/constants', async importOriginal => ({
  ...(await importOriginal<typeof import('../lib/crypto/constants')>()),
  PBKDF2_ITERATIONS: 1_000,
}));

const PHRASE = 'abacate cofre brisa forte janela lago milho navio pedra raiz selva tigre';
const DATA = {
  transactions: [{ id: 't1', description: 'Padaria São João', amount: -12.5 }],
  cards: [],
  cardPurchases: [],
  invoices: [],
  rules: [{ id: 'r1', keyword: 'padaria', category: 'Alimentação' }],
  exportDate: '2026-09-14T12:00:00.000Z',
};

async function accountWithKit() {
  const { envelope, dataKey } = await createVaultEnvelope('senhaDaConta');
  return { envelope: await addRecoveryWrap(PHRASE, dataKey, envelope), dataKey };
}

describe('backup v2', () => {
  it('opens with the recovery kit', async () => {
    const { envelope, dataKey } = await accountWithKit();
    const file = await exportBackupV2(JSON.stringify(DATA), dataKey, envelope);
    expect(await importBackupV2(file, { kind: 'kit', phrase: PHRASE })).toEqual(DATA);
  });

  it('records the kit iteration count of the account in the file', async () => {
    const { envelope, dataKey } = await accountWithKit();
    const file = JSON.parse(await exportBackupV2(JSON.stringify(DATA), dataKey, envelope));
    expect(file.wraps.kit.iterations).toBe(envelope.recoveryIterations);
    const { recoveryIterations: _ignored, ...oldEnvelope } = envelope;
    void _ignored;
    const oldFile = JSON.parse(await exportBackupV2(JSON.stringify(DATA), dataKey, oldEnvelope));
    expect(oldFile.wraps.kit.iterations).toBe(310_000);
  });

  it('opens with the account password', async () => {
    const { envelope, dataKey } = await accountWithKit();
    const file = await exportBackupV2(JSON.stringify(DATA), dataKey, envelope);
    expect(await importBackupV2(file, { kind: 'password', password: 'senhaDaConta' })).toEqual(DATA);
  });

  it('accepts the kit typed with capitals, extra spaces and accents', async () => {
    const { envelope, dataKey } = await accountWithKit();
    const file = await exportBackupV2(JSON.stringify(DATA), dataKey, envelope);
    const typed = `  ${PHRASE.toUpperCase().replace('LAGO', 'LÁGO').split(' ').join('   ')}\n`;
    expect(typed).toContain('LÁGO');
    expect(await importBackupV2(file, { kind: 'kit', phrase: typed })).toEqual(DATA);
  });

  it('fails with a wrong kit', async () => {
    const { envelope, dataKey } = await accountWithKit();
    const file = await exportBackupV2(JSON.stringify(DATA), dataKey, envelope);
    await expect(
      importBackupV2(file, { kind: 'kit', phrase: PHRASE.replace('tigre', 'urso') }),
    ).rejects.toThrow('Kit de recuperação incorreto para este backup.');
  });

  it('fails with a wrong password', async () => {
    const { envelope, dataKey } = await accountWithKit();
    const file = await exportBackupV2(JSON.stringify(DATA), dataKey, envelope);
    await expect(
      importBackupV2(file, { kind: 'password', password: 'outraSenha' }),
    ).rejects.toThrow('Senha incorreta para este backup.');
  });

  it('rejects empty credentials without deriving anything', async () => {
    const { envelope, dataKey } = await accountWithKit();
    const file = await exportBackupV2(JSON.stringify(DATA), dataKey, envelope);
    await expect(importBackupV2(file, { kind: 'kit', phrase: '   ' })).rejects.toThrow(
      'Digite as 12 palavras do kit.',
    );
    await expect(importBackupV2(file, { kind: 'password', password: '' })).rejects.toThrow(
      'Digite a senha da conta.',
    );
  });

  it('writes a gzip payload, the kit id and no secret material in clear', async () => {
    const { envelope, dataKey } = await accountWithKit();
    const now = new Date('2026-09-14T15:00:00.000Z');
    const file = await exportBackupV2(JSON.stringify(DATA), dataKey, envelope, now);
    const parsed = JSON.parse(file);

    expect(parsed.format).toBe('financaspro-backup');
    expect(parsed.v).toBe(2);
    expect(parsed.payload.z).toBe('gzip');
    expect(file).not.toContain('Padaria');
    expect(file).not.toContain('abacate');
    expect(readBackupV2Info(file)).toEqual({
      createdAt: '2026-09-14T15:00:00.000Z',
      kitId: envelope.kitId,
      kitCreatedAt: envelope.kitCreatedAt,
      opensWithKit: true,
      opensWithPassword: true,
    });
  });

  it('keeps opening with the kit and password of its time after the kit is renewed', async () => {
    const { envelope, dataKey } = await accountWithKit();
    const oldBackup = await exportBackupV2(JSON.stringify(DATA), dataKey, envelope);

    const newPhrase = 'barco canal delta erva farol gelo hora ilha jato lousa manta norte';
    const newKey = await generateDataKeyAsync();
    const renewed = await rotateVaultKey(
      'senhaDaConta',
      envelope,
      { dataKey: newKey, wrap: await createRecoveryKitWrap(newPhrase, newKey) },
      null,
    );

    expect(await importBackupV2(oldBackup, { kind: 'kit', phrase: PHRASE })).toEqual(DATA);
    await expect(
      importBackupV2(oldBackup, { kind: 'kit', phrase: newPhrase }),
    ).rejects.toThrow('Kit de recuperação incorreto');

    const newBackup = await exportBackupV2(JSON.stringify(DATA), newKey, renewed.envelope);
    await expect(importBackupV2(newBackup, { kind: 'kit', phrase: PHRASE })).rejects.toThrow(
      'Kit de recuperação incorreto',
    );
    expect(await importBackupV2(newBackup, { kind: 'kit', phrase: newPhrase })).toEqual(DATA);
  });

  it('exports an account without a kit as password-only', async () => {
    const { envelope, dataKey } = await createVaultEnvelope('senhaDaConta');
    const file = await exportBackupV2(JSON.stringify(DATA), dataKey, envelope);
    expect(readBackupV2Info(file).opensWithKit).toBe(false);
    await expect(importBackupV2(file, { kind: 'kit', phrase: PHRASE })).rejects.toThrow(
      'Este backup não tem kit de recuperação. Use a senha da conta.',
    );
    expect(await importBackupV2(file, { kind: 'password', password: 'senhaDaConta' })).toEqual(DATA);
  });

  it('reports a corrupted payload', async () => {
    const { envelope, dataKey } = await accountWithKit();
    const parsed = JSON.parse(await exportBackupV2(JSON.stringify(DATA), dataKey, envelope));
    const other = JSON.parse(
      await exportBackupV2(JSON.stringify(DATA), await generateDataKeyAsync(), envelope),
    );
    parsed.payload = other.payload;
    await expect(
      importBackupV2(JSON.stringify(parsed), { kind: 'password', password: 'senhaDaConta' }),
    ).rejects.toThrow('Backup corrompido: não foi possível decifrar os dados.');
  });

  it('rejects a malformed container with a Zod message', async () => {
    const { envelope, dataKey } = await accountWithKit();
    const parsed = JSON.parse(await exportBackupV2(JSON.stringify(DATA), dataKey, envelope));
    parsed.wraps = { kit: null, password: null };
    expect(() => readBackupV2Info(JSON.stringify(parsed))).toThrow(/Arquivo de backup inválido/);

    delete parsed.payload;
    await expect(
      importBackupV2(JSON.stringify(parsed), { kind: 'password', password: 'senhaDaConta' }),
    ).rejects.toThrow(/Arquivo de backup inválido/);
  });

  it('refuses to export data that does not match the backup schema', async () => {
    const { envelope, dataKey } = await accountWithKit();
    await expect(
      exportBackupV2(JSON.stringify({ transactions: 'não é lista' }), dataKey, envelope),
    ).rejects.toThrow(/Arquivo de backup inválido/);
  });

  it('enforces the size limit', async () => {
    const huge = 'x'.repeat(10 * 1024 * 1024 + 1);
    expect(() => readBackupV2Info(huge)).toThrow('Arquivo muito grande');
  });
});

describe('detectBackupFormat', () => {
  it('recognizes v2, v1, plain JSON and garbage', async () => {
    const { envelope, dataKey } = await accountWithKit();
    expect(detectBackupFormat(await exportBackupV2(JSON.stringify(DATA), dataKey, envelope))).toBe('v2');
    expect(detectBackupFormat(await encryptBackup('senha', JSON.stringify(DATA)))).toBe('v1');
    expect(detectBackupFormat(JSON.stringify(DATA))).toBe('plain');
    expect(detectBackupFormat('não é json')).toBe('unknown');
    expect(detectBackupFormat('[1,2]')).toBe('unknown');
  });
});

describe('backup v1 (before this change)', () => {
  it('still opens the fixture exported by the previous code with its backup password', async () => {
    expect(detectBackupFormat(legacyFixture.backupV1)).toBe('v1');
    const data = await importEncryptedBackup(legacyFixture.backupV1, legacyFixture.backupPassword);
    expect(data).toEqual(legacyFixture.expectedBackup);
  }, 30_000);

  it('fails with the wrong backup password', async () => {
    await expect(importEncryptedBackup(legacyFixture.backupV1, 'errada')).rejects.toThrow();
  }, 30_000);

  it('still imports plain JSON backups', () => {
    expect(importPlainBackup(JSON.stringify(DATA))).toEqual(DATA);
  });
});

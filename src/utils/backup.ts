import { z } from 'zod';
import {
  decryptBackup,
  decryptData,
  encryptData,
  normalizeKitWord,
  normalizePhrase,
  unlockRecoveryWrap,
  unlockVault,
} from '../lib/crypto';
import type { VaultEnvelope } from '../lib/crypto';
import { PBKDF2_ITERATIONS } from '../lib/crypto/constants';

const MAX_BACKUP_SIZE = 10 * 1024 * 1024; // 10 MB

export const BACKUP_FORMAT = 'financaspro-backup';
/** PBKDF2-SHA256 -> 512 bits; first half is the AES-GCM wrap key, SHA-256 of the second half is the verifier. */
const LOCAL_WRAP_KDF = 'pbkdf2-sha256-local-v1';

const backupSchema = z.object({
  transactions: z.array(z.unknown()).default([]),
  cards: z.array(z.unknown()).default([]),
  cardPurchases: z.array(z.unknown()).default([]),
  invoices: z.array(z.unknown()).default([]),
  rules: z.array(z.unknown()).default([]),
  exportDate: z.string().default(() => new Date().toISOString()),
}).passthrough();

export type BackupData = z.infer<typeof backupSchema>;

const base64 = z.string().min(1).regex(/^[A-Za-z0-9+/]+={0,2}$/, 'base64 inválido');
const iterations = z.number().int().min(1_000).max(10_000_000);

const passwordWrapSchema = z.object({
  kdf: z.literal(LOCAL_WRAP_KDF),
  salt: base64,
  iterations,
  verifier: base64,
  iv: base64,
  wrapped: base64,
});

const kitWrapSchema = z.object({
  kdf: z.literal(LOCAL_WRAP_KDF),
  id: z.string().nullable(),
  createdAt: z.string().nullable(),
  salt: base64,
  iterations,
  iv: base64,
  wrapped: base64,
});

const encryptedPayloadSchema = z.object({
  v: z.number(),
  alg: z.literal('AES-GCM'),
  kdf: z.literal('PBKDF2'),
  iv: base64,
  salt: z.string(),
  iterations: z.number(),
  ciphertext: base64,
  z: z.literal('gzip').optional(),
});

const backupV2Schema = z.object({
  format: z.literal(BACKUP_FORMAT),
  v: z.literal(2),
  createdAt: z.string(),
  wraps: z
    .object({
      kit: kitWrapSchema.nullable(),
      password: passwordWrapSchema.nullable(),
    })
    .refine(wraps => wraps.kit !== null || wraps.password !== null, {
      message: 'o arquivo não tem nenhuma forma de abertura',
    }),
  payload: encryptedPayloadSchema,
});

type BackupV2File = z.infer<typeof backupV2Schema>;

export type BackupFileFormat = 'v2' | 'v1' | 'plain' | 'unknown';

export type BackupCredential =
  | { kind: 'kit'; phrase: string }
  | { kind: 'password'; password: string };

export interface BackupV2Info {
  createdAt: string;
  kitId: string | null;
  kitCreatedAt: string | null;
  opensWithKit: boolean;
  opensWithPassword: boolean;
}

function validateBackupSchema(data: unknown): BackupData {
  const result = backupSchema.safeParse(data);
  if (!result.success) {
    throw new Error('Arquivo de backup inválido: ' + result.error.issues[0]?.message);
  }
  return result.data;
}

function assertSize(content: string): void {
  if (content.length > MAX_BACKUP_SIZE) {
    throw new Error(`Arquivo muito grande (limite: ${MAX_BACKUP_SIZE / 1024 / 1024} MB).`);
  }
}

function parseJsonOrNull(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function parseBackupV2(content: string): BackupV2File {
  assertSize(content);
  const result = backupV2Schema.safeParse(parseJsonOrNull(content));
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? ` (${issue.path.join('.')})` : '';
    throw new Error(`Arquivo de backup inválido: ${issue?.message ?? 'formato desconhecido'}${where}`);
  }
  return result.data;
}

export function detectBackupFormat(content: string): BackupFileFormat {
  const parsed = parseJsonOrNull(content) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'unknown';
  if (parsed.format === BACKUP_FORMAT && parsed.v === 2) return 'v2';
  if (parsed.alg === 'AES-GCM' && typeof parsed.ciphertext === 'string') return 'v1';
  return 'plain';
}

/**
 * Backup v2: the data encrypted with the account data key (gzip) plus the key
 * wraps of the moment of export. Opens with that kit or that account password;
 * later kit renewals or password changes do not affect the file.
 */
export async function exportBackupV2(
  plainJson: string,
  dataKey: CryptoKey,
  envelope: VaultEnvelope,
  now: Date = new Date(),
): Promise<string> {
  validateBackupSchema(JSON.parse(plainJson));

  const payload = JSON.parse(await encryptData(dataKey, plainJson, { compress: true }));
  const hasKit = Boolean(envelope.recoveryWrap && envelope.recoveryWrapIv && envelope.recoverySalt);

  const file: BackupV2File = {
    format: BACKUP_FORMAT,
    v: 2,
    createdAt: now.toISOString(),
    wraps: {
      kit: hasKit
        ? {
            kdf: LOCAL_WRAP_KDF,
            id: envelope.kitId ?? null,
            createdAt: envelope.kitCreatedAt ?? null,
            salt: envelope.recoverySalt!,
            // Recovery wraps always used this count; record it so the file is self-describing.
            iterations: PBKDF2_ITERATIONS,
            iv: envelope.recoveryWrapIv!,
            wrapped: envelope.recoveryWrap!,
          }
        : null,
      password: {
        kdf: LOCAL_WRAP_KDF,
        salt: envelope.salt,
        iterations: envelope.iterations,
        verifier: envelope.verifier,
        iv: envelope.wrappedDataKeyIv,
        wrapped: envelope.wrappedDataKey,
      },
    },
    payload,
  };

  // Validate what we write with the same schema the reader uses.
  const check = backupV2Schema.safeParse(file);
  if (!check.success) throw new Error('Não foi possível montar o backup.');

  return JSON.stringify(file);
}

export function readBackupV2Info(content: string): BackupV2Info {
  const file = parseBackupV2(content);
  return {
    createdAt: file.createdAt,
    kitId: file.wraps.kit?.id ?? null,
    kitCreatedAt: file.wraps.kit?.createdAt ?? null,
    opensWithKit: file.wraps.kit !== null,
    opensWithPassword: file.wraps.password !== null,
  };
}

function normalizeKitPhrase(phrase: string): string {
  return normalizePhrase(phrase).split(' ').map(normalizeKitWord).join(' ');
}

export async function importBackupV2(
  content: string,
  credential: BackupCredential,
): Promise<BackupData> {
  const file = parseBackupV2(content);

  let dataKey: CryptoKey;
  if (credential.kind === 'kit') {
    const kit = file.wraps.kit;
    if (!kit) throw new Error('Este backup não tem kit de recuperação. Use a senha da conta.');
    if (!credential.phrase.trim()) throw new Error('Digite as 12 palavras do kit.');
    try {
      dataKey = await unlockRecoveryWrap(
        normalizeKitPhrase(credential.phrase),
        { recoverySalt: kit.salt, recoveryWrap: kit.wrapped, recoveryWrapIv: kit.iv },
        kit.iterations,
      );
    } catch {
      throw new Error('Kit de recuperação incorreto para este backup.');
    }
  } else {
    const pw = file.wraps.password;
    if (!pw) throw new Error('Este backup não abre com senha. Use o kit de recuperação.');
    if (!credential.password) throw new Error('Digite a senha da conta.');
    try {
      dataKey = await unlockVault(credential.password, {
        v: 1,
        salt: pw.salt,
        iterations: pw.iterations,
        verifier: pw.verifier,
        wrappedDataKey: pw.wrapped,
        wrappedDataKeyIv: pw.iv,
      });
    } catch {
      throw new Error('Senha incorreta para este backup. Use a senha que a conta tinha quando o backup foi exportado.');
    }
  }

  let plainJson: string;
  try {
    plainJson = await decryptData(dataKey, JSON.stringify(file.payload));
  } catch {
    throw new Error('Backup corrompido: não foi possível decifrar os dados.');
  }

  const parsed = parseJsonOrNull(plainJson);
  if (parsed === null) throw new Error('Backup corrompido: conteúdo ilegível.');
  return validateBackupSchema(parsed);
}

/** Reads backups exported before v2 (standalone backup password). */
export async function importEncryptedBackup(
  encryptedContent: string,
  password: string,
): Promise<BackupData> {
  assertSize(encryptedContent);

  const plainJson = await decryptBackup(password, encryptedContent);
  const parsed = JSON.parse(plainJson);
  return validateBackupSchema(parsed);
}

export function importPlainBackup(jsonString: string): BackupData {
  assertSize(jsonString);

  const parsed = JSON.parse(jsonString);
  return validateBackupSchema(parsed);
}

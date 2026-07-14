import { z } from 'zod';
import { encryptBackup, decryptBackup } from '../lib/crypto/crypto';

const MAX_BACKUP_SIZE = 10 * 1024 * 1024; // 10 MB

const backupSchema = z.object({
  transactions: z.array(z.unknown()).default([]),
  cards: z.array(z.unknown()).default([]),
  cardPurchases: z.array(z.unknown()).default([]),
  invoices: z.array(z.unknown()).default([]),
  rules: z.array(z.unknown()).default([]),
  exportDate: z.string().default(() => new Date().toISOString()),
}).passthrough();

export type BackupData = z.infer<typeof backupSchema>;

function validateBackupSchema(data: unknown): BackupData {
  const result = backupSchema.safeParse(data);
  if (!result.success) {
    throw new Error('Arquivo de backup invalido: ' + result.error.issues[0]?.message);
  }
  return result.data;
}

export async function exportEncryptedBackup(
  plainJson: string,
  password: string,
): Promise<string> {
  const parsed = JSON.parse(plainJson);
  validateBackupSchema(parsed);
  return encryptBackup(password, plainJson);
}

export async function importEncryptedBackup(
  encryptedContent: string,
  password: string,
): Promise<BackupData> {
  if (encryptedContent.length > MAX_BACKUP_SIZE) {
    throw new Error(`Arquivo muito grande (limite: ${MAX_BACKUP_SIZE / 1024 / 1024} MB).`);
  }

  const plainJson = await decryptBackup(password, encryptedContent);
  const parsed = JSON.parse(plainJson);
  return validateBackupSchema(parsed);
}

export function importPlainBackup(jsonString: string): BackupData {
  if (jsonString.length > MAX_BACKUP_SIZE) {
    throw new Error(`Arquivo muito grande (limite: ${MAX_BACKUP_SIZE / 1024 / 1024} MB).`);
  }

  const parsed = JSON.parse(jsonString);
  return validateBackupSchema(parsed);
}

export function isEncryptedBackup(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    return parsed?.alg === 'AES-GCM' && typeof parsed?.ciphertext === 'string';
  } catch {
    return false;
  }
}

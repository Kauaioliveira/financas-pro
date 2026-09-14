export interface SecretFinding {
  kind: 'sb_secret' | 'service_role JWT';
  /** First characters only; the full key is never printed. */
  sample: string;
}

export function findSecrets(content: string): SecretFinding[];
export function findCloudCode(content: string): string[];
export function checkBundle(dir: string, options?: { expectLocal?: boolean }): Promise<string[]>;

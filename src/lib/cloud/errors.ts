export type CloudErrorKind =
  | 'network'
  | 'invalid-credentials'
  | 'email-not-confirmed'
  | 'signup-blocked'
  | 'rate-limited'
  | 'weak-password'
  | 'not-authenticated'
  | 'conflict'
  | 'too-many-key-changes'
  | 'server';

const MESSAGES: Record<CloudErrorKind, string> = {
  network: 'Sem conexão com a nuvem. Verifique a internet e tente de novo.',
  'invalid-credentials': 'E-mail ou senha incorretos.',
  'email-not-confirmed': 'Confirme seu e-mail antes de entrar. Procure o link na sua caixa de entrada.',
  'signup-blocked': 'Cadastro não permitido para este e-mail.',
  'rate-limited': 'Muitas tentativas em pouco tempo. Aguarde um minuto e tente de novo.',
  'weak-password': 'O servidor recusou a senha. Tente outra.',
  'not-authenticated': 'Sua sessão na nuvem expirou. Entre de novo.',
  conflict: 'Os dados na nuvem mudaram em outro aparelho.',
  'too-many-key-changes':
    'Muitas trocas de senha ou de kit nas últimas 24 horas. Aguarde e tente de novo — nada foi alterado.',
  server: 'A nuvem respondeu com um erro. Tente de novo em instantes.',
};

/** Error from the cloud with a message ready for the user (Portuguese). */
export class CloudError extends Error {
  readonly kind: CloudErrorKind;
  constructor(kind: CloudErrorKind, message: string = MESSAGES[kind]) {
    super(message);
    this.name = 'CloudError';
    this.kind = kind;
  }
}

export function isCloudError(err: unknown, kind?: CloudErrorKind): err is CloudError {
  return err instanceof CloudError && (kind === undefined || err.kind === kind);
}

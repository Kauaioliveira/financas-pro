/**
 * Password rule for cloud accounts, checked in the browser: the server only ever
 * sees a derived secret, so it cannot judge the password.
 * NIST SP 800-63B-4 asks for 15 characters for single-factor passwords; 12 is the
 * beta decision (see docs/pesquisa/deploy-e-banco-gratis-2026-09-14.md §2).
 */
export const CLOUD_PASSWORD_MIN_LENGTH = 12;

/** Whole passwords seen in leak lists that pass the length rule. */
const COMMON_PASSWORDS = new Set([
  '123456789012', '1234567890123', '12345678901234', '123456789123', '123456123456',
  '123123123123', '147258369147', '159753159753', '987654321098', '111111111111',
  '000000000000', '121212121212', '112233445566', '1q2w3e4r5t6y', 'q1w2e3r4t5y6',
  '1qaz2wsx3edc', 'zaq12wsxcde3', 'qazwsxedcrfv', 'qwertyuiopas', 'qwertyuiop12',
  'qwerty123456', '123456qwerty', 'asdfghjkl123', 'asdfghjklzxc', 'zxcvbnmasdfg',
  'password1234', 'password123!', 'passw0rd1234', 'p@ssw0rd1234', 'iloveyou1234',
  'senha1234567', 'senha12345678', 'minhasenha123', 'minhasenha12', 'senhasenha12',
  'abcdefghijkl', 'abcd12345678', 'abc123456789', '123456789abc', 'teamo1234567',
  'brasil123456', 'mudar1234567', 'trocar123456', 'aaaaaaaaaaaa', 'abcabcabcabc',
]);

/** Common words that are still weak with digits or symbols around them ("flamengo2024!"). */
const COMMON_WORDS = new Set([
  'password', 'passw', 'senha', 'minhasenha', 'qwerty', 'qwertyuiop', 'asdfgh', 'asdfghjkl',
  'zxcvbnm', 'qazwsx', 'abc', 'abcd', 'abcdef', 'admin', 'administrador', 'root', 'user',
  'usuario', 'teste', 'test', 'iloveyou', 'teamo', 'amor', 'deus', 'jesus', 'familia',
  'brasil', 'flamengo', 'corinthians', 'palmeiras', 'saopaulo', 'vasco', 'gremio',
  'cruzeiro', 'santos', 'botafogo', 'fluminense', 'internacional', 'atletico', 'futebol',
  'football', 'dragon', 'monkey', 'master', 'sunshine', 'princess', 'welcome', 'bemvindo',
  'letmein', 'changeme', 'mudar', 'trocar', 'batman', 'superman', 'naruto', 'pokemon',
  'minecraft', 'starwars', 'financas', 'financaspro', 'dinheiro', 'banco', 'nubank',
  'itau', 'bradesco', 'caixa', 'santander',
]);

const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

function simplify(value: string): string {
  return value.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
}

/** "abcabcab", "1212121": a short block repeated, even if the last copy is cut. */
function isRepeatedBlock(value: string): boolean {
  for (let size = 1; size <= value.length / 2; size++) {
    let repeated = true;
    for (let i = size; i < value.length && repeated; i++) {
      repeated = value[i] === value[i % size];
    }
    if (repeated) return true;
  }
  return false;
}

/** "abcdef", "3456789012", "987654321098": each character one step from the previous. */
function isSequence(value: string): boolean {
  if (value.length < 3) return false;
  const step = value.charCodeAt(1) - value.charCodeAt(0);
  if (Math.abs(step) !== 1) return false;
  for (let i = 1; i < value.length; i++) {
    const diff = value.charCodeAt(i) - value.charCodeAt(i - 1);
    const digitWrap =
      (step === 1 && value[i - 1] === '9' && value[i] === '0') ||
      (step === -1 && value[i - 1] === '0' && value[i] === '9');
    if (diff !== step && !digitWrap) return false;
  }
  return true;
}

/** Returns a message in Portuguese when the password is not acceptable, or null. */
export function checkCloudPassword(password: string, email = ''): string | null {
  if ([...password].length < CLOUD_PASSWORD_MIN_LENGTH) {
    return `A senha deve ter pelo menos ${CLOUD_PASSWORD_MIN_LENGTH} caracteres.`;
  }

  const simple = simplify(password);
  const compact = simple.replace(/\s+/g, '');
  const weak = 'Essa senha é muito comum ou fácil de adivinhar. Use uma frase só sua, com palavras que não combinem.';

  if (COMMON_PASSWORDS.has(compact) || isRepeatedBlock(compact) || isSequence(compact)) return weak;

  const letters = compact.replace(/[^a-z]/g, '');
  if (letters.length === 0) {
    const digits = compact.replace(/[^0-9]/g, '');
    if (digits.length === compact.length && (isRepeatedBlock(digits) || isSequence(digits))) return weak;
  } else if (COMMON_WORDS.has(letters) || isRepeatedBlock(letters)) {
    return weak; // "flamengo2024!", "senhasenha12"
  }

  const localPart = simplify(email.trim()).split('@')[0] ?? '';
  if (localPart.length >= 4 && compact.includes(localPart)) {
    return 'Não use o seu e-mail na senha.';
  }
  return null;
}

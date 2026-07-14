// BIP-39 inspired Portuguese wordlist (128 common words for 12-word phrases)
// Each word is unique, 4-8 chars, easy to write down
const WORDS = [
  'abacate', 'abraco', 'acesso', 'acordo', 'agora', 'altura', 'amigo', 'ancora',
  'animal', 'aviso', 'baleia', 'banco', 'barco', 'brilho', 'brisa', 'busca',
  'cabo', 'calmo', 'campo', 'canal', 'canto', 'carga', 'carro', 'casa',
  'chave', 'cinco', 'circo', 'claro', 'cobra', 'cofre', 'coral', 'corpo',
  'dado', 'delta', 'dente', 'disco', 'dobro', 'duplo', 'elite', 'erva',
  'etapa', 'exato', 'faixa', 'falha', 'farol', 'ferro', 'fibra', 'final',
  'flauta', 'foco', 'folha', 'fonte', 'forma', 'forte', 'frase', 'frota',
  'garra', 'gelo', 'globo', 'golpe', 'grade', 'grilo', 'grupo', 'guia',
  'hora', 'iate', 'ideia', 'igual', 'ilha', 'index', 'inicio', 'isca',
  'janela', 'jato', 'jornal', 'justo', 'lago', 'lapis', 'leao', 'limao',
  'linha', 'lista', 'livro', 'local', 'lousa', 'lugar', 'malha', 'manta',
  'marco', 'meiga', 'metal', 'milho', 'molde', 'moeda', 'navio', 'nivel',
  'norte', 'nuvem', 'oasis', 'olhar', 'onda', 'ordem', 'palco', 'pedra',
  'peixe', 'plano', 'porta', 'prata', 'pulso', 'raiz', 'renda', 'ritmo',
  'rocha', 'ronda', 'safra', 'salto', 'selva', 'sinal', 'solar', 'sulco',
  'tecla', 'terra', 'tigre', 'torre', 'trilha', 'turma', 'urso', 'valor',
];

export function generateRecoveryPhrase(wordCount = 12): string {
  const indices = crypto.getRandomValues(new Uint8Array(wordCount));
  return Array.from(indices)
    .map(b => WORDS[b % WORDS.length])
    .join(' ');
}

export function normalizePhrase(phrase: string): string {
  return phrase.toLowerCase().trim().replace(/\s+/g, ' ');
}

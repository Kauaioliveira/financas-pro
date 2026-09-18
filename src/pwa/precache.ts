/**
 * Quais arquivos do build o service worker guarda já na instalação. Sem `import.meta`
 * e sem dependência do navegador: vite.config.ts (Node) importa isto no build para
 * montar dist/sw.js, e src/pwa/precache.test.ts cobre as regras.
 */

/** Um arquivo produzido pelo build, do jeito que ele será servido. */
export interface BuildFile {
  /** Caminho a partir da raiz do site, sem a barra inicial (ex.: `assets/index-a1b2.js`). */
  path: string;
  /** Tamanho em bytes. */
  size: number;
}

/**
 * Acima disto o arquivo fica de fora da instalação: baixar tudo de uma vez num plano de
 * dados caro seria hostil, e o único arquivo grande hoje (o leitor de PDF, ~2 MB) só é
 * preciso quando o usuário importa uma fatura em PDF. Ele entra no cache na primeira vez
 * que for usado, pela regra de arquivos com hash no nome.
 */
export const MAX_PRECACHE_BYTES = 1024 * 1024;

/** Nada que não seja servido ao navegador ou que não sirva offline. */
const SKIP_SUFFIXES = ['.map', '.gz', '.br'];

/** Arquivos de configuração de deploy (`_headers`, `_redirects`) não são conteúdo do site. */
function isDeployConfig(path: string): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return name.startsWith('_');
}

export function shouldPrecache(file: BuildFile): boolean {
  if (isDeployConfig(file.path)) return false;
  if (SKIP_SUFFIXES.some(suffix => file.path.endsWith(suffix))) return false;
  return file.size <= MAX_PRECACHE_BYTES;
}

/**
 * Lista final para o `cache.addAll` da instalação: caminhos absolutos, sem repetição e
 * em ordem estável (o build precisa ser reprodutível para a versão do cache não mudar à toa).
 */
export function precachePaths(files: BuildFile[]): string[] {
  const paths = files.filter(shouldPrecache).map(file => `/${file.path.replace(/^\/+/, '')}`);
  return [...new Set(paths)].sort();
}

import { describe, expect, it } from 'vitest';
import { MAX_PRECACHE_BYTES, precachePaths, shouldPrecache } from './precache';

const small = (path: string) => ({ path, size: 1_000 });

describe('precachePaths', () => {
  it('inclui os arquivos do build com caminho absoluto e em ordem estável', () => {
    const paths = precachePaths([small('index.html'), small('assets/index-a1b2.js'), small('manifest.webmanifest')]);
    expect(paths).toEqual(['/assets/index-a1b2.js', '/index.html', '/manifest.webmanifest']);
  });

  it('não repete o mesmo arquivo', () => {
    expect(precachePaths([small('index.html'), small('/index.html')])).toEqual(['/index.html']);
  });

  it('deixa de fora os arquivos grandes demais para a instalação', () => {
    const files = [small('assets/app.js'), { path: 'assets/pdf.worker.mjs', size: MAX_PRECACHE_BYTES + 1 }];
    expect(precachePaths(files)).toEqual(['/assets/app.js']);
  });

  it('deixa de fora mapas de código e configuração de deploy', () => {
    expect(precachePaths([small('assets/app.js.map'), small('_headers'), small('_redirects')])).toEqual([]);
  });
});

describe('shouldPrecache', () => {
  it('aceita um arquivo exatamente no limite de tamanho', () => {
    expect(shouldPrecache({ path: 'assets/app.js', size: MAX_PRECACHE_BYTES })).toBe(true);
    expect(shouldPrecache({ path: 'assets/app.js', size: MAX_PRECACHE_BYTES + 1 })).toBe(false);
  });

  it('não confunde um nome que apenas começa com sublinhado dentro de uma pasta', () => {
    expect(shouldPrecache(small('assets/_interno.js'))).toBe(false);
    expect(shouldPrecache(small('icons/icon-192.png'))).toBe(true);
  });
});

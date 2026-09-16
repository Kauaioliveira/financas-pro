import { describe, expect, it } from 'vitest';
import {
  BETA_TERMS,
  CONTACT_EMAIL,
  LEGAL_DOCUMENTS,
  LEGAL_VERSION,
  PRIVACY_POLICY,
  hasPendingPlaceholders,
} from './documents';
import type { LegalDocument } from './documents';
import { legalHash, legalRouteFromHash } from './routes';

function text(document: LegalDocument): string {
  return [
    document.title,
    document.intro,
    ...document.sections.flatMap(section => [section.title, ...(section.paragraphs ?? []), ...(section.items ?? [])]),
  ].join('\n');
}

describe('legal routes', () => {
  it('reads the page from the address bar and ignores anything else', () => {
    expect(legalRouteFromHash('#/privacidade')).toBe('privacidade');
    expect(legalRouteFromHash('#/termos')).toBe('termos');
    expect(legalRouteFromHash('#privacidade')).toBe('privacidade');
    expect(legalRouteFromHash('')).toBeNull();
    expect(legalRouteFromHash('#/outra')).toBeNull();
    expect(legalRouteFromHash('#access_token=abc')).toBeNull();
  });

  it('builds the link back', () => {
    expect(legalRouteFromHash(legalHash('termos'))).toBe('termos');
  });
});

describe('privacy policy', () => {
  const content = text(PRIVACY_POLICY);

  it.each([
    ['o controlador e o canal de contato', /controlador/i],
    ['o e-mail e o nome da conta', /e-mail e nome de exibição/i],
    ['o cofre que o servidor não lê', /cifrad/i],
    ['as opiniões enviadas', /opiniões/i],
    ['onde os dados ficam', /São Paulo/],
    ['a transferência internacional', /transferência internacional/i],
    ['os prazos', /Por quanto tempo/],
    ['como pedir a exclusão', /exclusão/i],
    ['os direitos do titular', /Seus direitos/],
    ['a ANPD em caso de incidente', /ANPD/],
  ])('says %s', (_name, pattern) => {
    expect(content).toMatch(pattern);
  });

  it('repeats the contact channel where a request is made', () => {
    expect(content).toContain(CONTACT_EMAIL);
  });

  it('does not promise a delete button the app does not have', () => {
    expect(content).toMatch(/Ainda não existe um botão de "apagar minha conta"/);
  });
});

describe('beta terms', () => {
  const content = text(BETA_TERMS);

  it.each([
    ['que é um teste sem garantia', /Sem garantia/],
    ['que pode perder dados', /perder/i],
    ['que o kit é responsabilidade do usuário', /kit de recuperação/i],
    ['que o app não conecta ao banco', /não se conecta ao seu banco/i],
    ['como encerrar', /Encerramento/],
    ['a versão aceita no cadastro', new RegExp(LEGAL_VERSION)],
  ])('says %s', (_name, pattern) => {
    expect(content).toMatch(pattern);
  });
});

describe('placeholders the owner must fill', () => {
  it('are detected in both documents while they are not replaced', () => {
    expect(hasPendingPlaceholders(PRIVACY_POLICY)).toBe(true);
    expect(hasPendingPlaceholders(BETA_TERMS)).toBe(true);
  });

  it('are gone from a document that has no marker', () => {
    expect(hasPendingPlaceholders({ ...PRIVACY_POLICY, sections: [], intro: 'texto pronto' })).toBe(false);
  });
});

describe('documents index', () => {
  it('has one document per route, matching its own route field', () => {
    for (const [route, document] of Object.entries(LEGAL_DOCUMENTS)) {
      expect(document.route).toBe(route);
      expect(document.sections.length).toBeGreaterThan(3);
    }
  });

  it('has a dated version, used as the consent record', () => {
    expect(LEGAL_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

/**
 * Addresses of the legal pages, apart from their text so that screens shared with the
 * local mode (settings) can link to them without carrying the whole policy.
 */

export type LegalRoute = 'privacidade' | 'termos';

export const LEGAL_TITLES: Record<LegalRoute, string> = {
  privacidade: 'Política de privacidade',
  termos: 'Termos do beta',
};

/** Hash that opens the page, so the link can be sent in a message. */
export function legalHash(route: LegalRoute): string {
  return `#/${route}`;
}

/** The page the address bar asks for, or null. */
export function legalRouteFromHash(hash: string): LegalRoute | null {
  const value = hash.replace(/^#\/?/, '').toLowerCase();
  return value === 'privacidade' || value === 'termos' ? value : null;
}

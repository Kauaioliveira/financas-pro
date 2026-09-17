import { LEGAL_TITLES, legalHash } from '../lib/legal/routes';

const LINK_CLASS =
  'rounded-lg px-1.5 py-1 underline decoration-white/20 underline-offset-4 transition hover:text-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300';

/**
 * Links to the privacy policy and the beta terms. Only the addresses come from here, so
 * screens shared with the local mode can link to the pages without carrying their text.
 */
export function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <p className={`text-xs text-slate-400 ${className}`}>
      <a href={legalHash('privacidade')} className={LINK_CLASS}>
        {LEGAL_TITLES.privacidade}
      </a>
      <span aria-hidden="true"> · </span>
      <a href={legalHash('termos')} className={LINK_CLASS}>
        {LEGAL_TITLES.termos}
      </a>
    </p>
  );
}

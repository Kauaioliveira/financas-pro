import { useEffect, useId } from 'react';
import { AlertTriangle, ArrowLeft, FileText, ShieldCheck } from 'lucide-react';
import { LEGAL_DOCUMENTS, LEGAL_VERSION, hasPendingPlaceholders } from '../../lib/legal/documents';
import { legalHash } from '../../lib/legal/routes';
import type { LegalRoute } from '../../lib/legal/routes';
import { FOCUS_RING } from './CloudUi';

/**
 * Privacy policy and beta terms, opened by #/privacidade and #/termos over whatever is
 * on screen (login or the app), so the same page serves the login footer, the settings
 * and the consent checkboxes of the sign-up.
 */
export default function LegalPage({ route, onClose }: { route: LegalRoute; onClose: () => void }) {
  const document = LEGAL_DOCUMENTS[route];
  const titleId = useId();
  const other: LegalRoute = route === 'privacidade' ? 'termos' : 'privacidade';
  const Icon = route === 'privacidade' ? ShieldCheck : FileText;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto" style={{ background: 'var(--app-bg)' }}>
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <button
          type="button"
          onClick={onClose}
          className={`inline-flex items-center gap-1.5 rounded-xl px-2 py-1 text-sm text-slate-400 transition hover:text-cyan-200 ${FOCUS_RING}`}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar
        </button>

        <article aria-labelledby={titleId} className="dark-surface mt-4 rounded-[24px] p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-cyan-500/12 text-cyan-300 ring-1 ring-inset ring-cyan-400/18">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 id={titleId} className="font-display text-2xl font-semibold text-white">
                {document.title}
              </h1>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                FinançasPro (beta) · versão {LEGAL_VERSION}
              </p>
            </div>
          </div>

          {hasPendingPlaceholders(document) && (
            <p
              role="alert"
              className="mt-5 flex items-start gap-3 rounded-xl bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              Este texto ainda tem trechos entre colchetes que o responsável pelo app precisa preencher (nome e e-mail de
              contato). Enquanto isso, peça esses dados a quem convidou você para o beta.
            </p>
          )}

          <p className="mt-5 text-sm leading-7 text-slate-300">{document.intro}</p>

          {document.sections.map(section => (
            <section key={section.title} className="mt-7">
              <h2 className="font-display text-lg font-semibold text-white">{section.title}</h2>
              {section.items && (
                <ul className="mt-3 space-y-2">
                  {section.items.map(item => (
                    <li key={item} className="flex gap-2 text-sm leading-7 text-slate-400">
                      <span aria-hidden="true" className="mt-3 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-cyan-300/60" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
              {section.paragraphs?.map(paragraph => (
                <p key={paragraph} className="mt-3 text-sm leading-7 text-slate-400">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}

          <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <a
              href={legalHash(other)}
              className={`rounded-xl px-2 py-1 text-sm font-semibold text-cyan-200/80 transition hover:text-cyan-100 ${FOCUS_RING}`}
            >
              Ler também: {LEGAL_DOCUMENTS[other].title}
            </a>
            <button
              type="button"
              onClick={onClose}
              className={`rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] ${FOCUS_RING}`}
            >
              Voltar ao app
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}

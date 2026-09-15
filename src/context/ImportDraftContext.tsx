import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ImportDraftContext } from './ImportDraftContext.shared';
import type { CardImportDraft, ImportDraft } from './ImportDraftContext.shared';

/**
 * Guarda a pré-visualização de um import fora da aba, para que trocar de aba
 * não descarte um arquivo já lido (extrato bancário ou fatura do cartão). Fica
 * só em memória — o extrato em texto puro nunca vai para
 * localStorage/sessionStorage — e some ao sair da conta.
 */
export function ImportDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [cardDraft, setCardDraft] = useState<CardImportDraft | null>(null);
  const hasPendingPreview = (draft?.preview.length ?? 0) > 0 || (cardDraft?.preview.length ?? 0) > 0;

  useEffect(() => {
    if (!hasPendingPreview) return;
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasPendingPreview]);

  const value = useMemo(() => ({ draft, setDraft, cardDraft, setCardDraft }), [draft, cardDraft]);

  return <ImportDraftContext.Provider value={value}>{children}</ImportDraftContext.Provider>;
}

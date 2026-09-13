import { useContext } from 'react';
import { ImportDraftContext } from './ImportDraftContext.shared';
import type { ImportDraftContextType } from './ImportDraftContext.shared';

export function useImportDraft(): ImportDraftContextType {
  const context = useContext(ImportDraftContext);
  if (!context) {
    throw new Error('useImportDraft deve ser usado dentro de ImportDraftProvider');
  }

  return context;
}

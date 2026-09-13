import { createContext } from 'react';
import type { Transaction } from '../types';
import type { BankStatementParseMeta } from '../utils/parser';

export interface ImportDraft {
  preview: Transaction[];
  meta: BankStatementParseMeta | null;
  fileName: string;
}

export interface ImportDraftContextType {
  draft: ImportDraft | null;
  setDraft: (draft: ImportDraft | null) => void;
}

export const ImportDraftContext = createContext<ImportDraftContextType | null>(null);

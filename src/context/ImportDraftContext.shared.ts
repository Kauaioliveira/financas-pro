import { createContext } from 'react';
import type { CardPurchase, Transaction } from '../types';
import type { BankStatementParseMeta } from '../utils/parser';

export interface ImportDraft {
  preview: Transaction[];
  meta: BankStatementParseMeta | null;
  fileName: string;
}

export interface CardImportDraft {
  cardId: string;
  preview: CardPurchase[];
  fileName: string;
  /** Referência ao arquivo escolhido, para reler se o usuário trocar de cartão. */
  file: File;
}

export interface ImportDraftContextType {
  draft: ImportDraft | null;
  setDraft: (draft: ImportDraft | null) => void;
  cardDraft: CardImportDraft | null;
  setCardDraft: (draft: CardImportDraft | null) => void;
}

export const ImportDraftContext = createContext<ImportDraftContextType | null>(null);

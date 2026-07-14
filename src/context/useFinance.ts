import { useContext } from 'react';
import { FinanceContext } from './FinanceContext.shared';
import type { FinanceContextType } from './FinanceContext.shared';

export function useFinance(): FinanceContextType {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error('useFinance deve ser usado dentro de FinanceProvider');
  }

  return context;
}

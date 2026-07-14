import { useContext } from 'react';
import { AuthCtx } from './AuthContext.shared';
import type { AuthContextType } from './AuthContext.shared';

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}

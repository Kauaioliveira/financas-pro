import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalAuthProvider } from './localAuthProvider';
import type { AuthProvider } from './types';

// See crypto.test.ts: envelopes store their iteration count, so a low count keeps
// the same code paths without the PBKDF2 cost that made this file time out.
vi.mock('../crypto/constants', async importOriginal => ({
  ...(await importOriginal<typeof import('../crypto/constants')>()),
  PBKDF2_ITERATIONS: 1_000,
}));

describe('localAuthProvider', () => {
  let provider: AuthProvider;

  beforeEach(() => {
    localStorage.clear();
    provider = createLocalAuthProvider();
  });

  describe('register', () => {
    it('rejects passwords shorter than 6 characters', async () => {
      await expect(provider.register('Fulano', '12345')).rejects.toThrow(
        'A senha deve ter pelo menos 6 caracteres.',
      );
    });

    it('accepts a 6-character password and persists the account', async () => {
      const session = await provider.register('Fulano', '123456');
      expect(session.displayName).toBe('Fulano');
      expect(session.dataKey).toBeDefined();
      expect(provider.listUsers()).toHaveLength(1);
      expect(provider.listUsers()[0].displayName).toBe('Fulano');
    });

    it('trims the display name', async () => {
      await provider.register('  Fulano  ', '123456');
      expect(provider.listUsers()[0].displayName).toBe('Fulano');
    });
  });

  describe('signIn', () => {
    it('signs in successfully with the correct password', async () => {
      const registered = await provider.register('Fulano', 'senhaCerta');
      const session = await provider.signIn(registered.userId, 'senhaCerta');
      expect(session.userId).toBe(registered.userId);
      expect(session.displayName).toBe('Fulano');
    });

    it('throws for an unknown user id', async () => {
      await expect(provider.signIn('nao-existe', 'qualquer')).rejects.toThrow(
        'Conta não encontrada.',
      );
    });

    it('decrements the remaining-attempts counter across repeated wrong-password calls', async () => {
      const registered = await provider.register('Fulano', 'senhaCerta');

      await expect(provider.signIn(registered.userId, 'errada1')).rejects.toThrow(
        'Senha incorreta. 4 tentativas restantes.',
      );
      await expect(provider.signIn(registered.userId, 'errada2')).rejects.toThrow(
        'Senha incorreta. 3 tentativas restantes.',
      );
      await expect(provider.signIn(registered.userId, 'errada3')).rejects.toThrow(
        'Senha incorreta. 2 tentativas restantes.',
      );
      await expect(provider.signIn(registered.userId, 'errada4')).rejects.toThrow(
        'Senha incorreta. 1 tentativa restante.',
      );
    });

    it('locks the account for 5 minutes after the 5th consecutive failure', async () => {
      vi.useFakeTimers();
      try {
        const registered = await provider.register('Fulano', 'senhaCerta');

        for (let i = 0; i < 4; i++) {
          await expect(provider.signIn(registered.userId, 'errada')).rejects.toThrow();
        }

        await expect(provider.signIn(registered.userId, 'errada')).rejects.toThrow(
          'Senha incorreta. Conta bloqueada por 5 minutos.',
        );

        expect(provider.isLockedOut(registered.userId)).toBe(true);

        // Even the correct password is rejected while locked out.
        await expect(provider.signIn(registered.userId, 'senhaCerta')).rejects.toThrow(
          /Conta bloqueada por excesso de tentativas/,
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('clears the lockout after the lockout duration elapses', async () => {
      vi.useFakeTimers();
      try {
        const registered = await provider.register('Fulano', 'senhaCerta');

        for (let i = 0; i < 5; i++) {
          await expect(provider.signIn(registered.userId, 'errada')).rejects.toThrow();
        }
        expect(provider.isLockedOut(registered.userId)).toBe(true);

        vi.advanceTimersByTime(5 * 60 * 1000 + 1);

        expect(provider.isLockedOut(registered.userId)).toBe(false);
        const session = await provider.signIn(registered.userId, 'senhaCerta');
        expect(session.userId).toBe(registered.userId);
      } finally {
        vi.useRealTimers();
      }
    });

    it('resets the failure count after a successful sign-in', async () => {
      const registered = await provider.register('Fulano', 'senhaCerta');
      await expect(provider.signIn(registered.userId, 'errada')).rejects.toThrow(
        'Senha incorreta. 4 tentativas restantes.',
      );
      await provider.signIn(registered.userId, 'senhaCerta');

      // Failure counter should have reset — next wrong attempt is "1st" again.
      await expect(provider.signIn(registered.userId, 'errada')).rejects.toThrow(
        'Senha incorreta. 4 tentativas restantes.',
      );
    });
  });

  describe('changePassword', () => {
    it('requires the correct old password', async () => {
      const registered = await provider.register('Fulano', 'senhaAntiga');
      await expect(
        provider.changePassword(registered.userId, 'senhaErrada', 'senhaNova123'),
      ).rejects.toThrow('Senha incorreta.');
    });

    it('rejects a new password shorter than 6 characters', async () => {
      const registered = await provider.register('Fulano', 'senhaAntiga');
      await expect(
        provider.changePassword(registered.userId, 'senhaAntiga', 'abc'),
      ).rejects.toThrow('A nova senha deve ter pelo menos 6 caracteres.');
    });

    it('allows sign-in with the new password after a successful change', async () => {
      const registered = await provider.register('Fulano', 'senhaAntiga');
      await provider.changePassword(registered.userId, 'senhaAntiga', 'senhaNova123');

      await expect(provider.signIn(registered.userId, 'senhaAntiga')).rejects.toThrow();
      const session = await provider.signIn(registered.userId, 'senhaNova123');
      expect(session.userId).toBe(registered.userId);
    });
  });

  describe('deleteAccount', () => {
    it('requires the correct password', async () => {
      const registered = await provider.register('Fulano', 'senhaCerta');
      await expect(
        provider.deleteAccount(registered.userId, 'senhaErrada'),
      ).rejects.toThrow('Senha incorreta.');
      expect(provider.listUsers()).toHaveLength(1);
    });

    it('removes the account when the password is correct', async () => {
      const registered = await provider.register('Fulano', 'senhaCerta');
      await provider.deleteAccount(registered.userId, 'senhaCerta');
      expect(provider.listUsers()).toHaveLength(0);
    });
  });

  describe('getEnvelope / updateEnvelope', () => {
    it('returns null for an unknown user', () => {
      expect(provider.getEnvelope('nao-existe')).toBeNull();
    });

    it('returns the stored envelope for a known user', async () => {
      const registered = await provider.register('Fulano', 'senhaCerta');
      const envelope = provider.getEnvelope(registered.userId);
      expect(envelope).not.toBeNull();
      expect(envelope?.v).toBeDefined();
    });

    it('persists an updated envelope', async () => {
      const registered = await provider.register('Fulano', 'senhaCerta');
      const envelope = provider.getEnvelope(registered.userId)!;
      const updated = { ...envelope, verifier: 'tampered-verifier' };
      provider.updateEnvelope(registered.userId, updated);
      expect(provider.getEnvelope(registered.userId)?.verifier).toBe('tampered-verifier');
    });

    it('is a no-op for an unknown user', async () => {
      const registered = await provider.register('Fulano', 'senhaCerta');
      const envelope = provider.getEnvelope(registered.userId)!;
      provider.updateEnvelope('nao-existe', envelope);
      expect(provider.listUsers()).toHaveLength(1);
    });
  });
});

afterEach(() => {
  vi.useRealTimers();
});

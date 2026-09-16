import { useId, useState } from 'react';
import { History, KeyRound, LogOut, RotateCcw, Upload } from 'lucide-react';
import type { AuthSession } from '../../lib/auth';
import type { CloudAuthProvider, RecoveryResult } from '../../lib/cloud/cloudAuthProvider';
import { AuthPage, ErrorMessage, FOCUS_RING, Notice, PasswordField, PrimaryButton, SecondaryButton } from './CloudUi';
import { errorText } from './errorText';

type Panel = 'kit' | 'old-password' | 'start-over' | 'start-over-confirm';

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * "Abrir dados com o kit": the login works, but the password does not open the data
 * (it was reset by e-mail). The kit, the old password or a backup bring the data back.
 */
export function OpenWithKitScreen({
  provider,
  email,
  onUnlocked,
  onRestoreBackup,
  onStartOver,
  onSignOut,
}: {
  provider: CloudAuthProvider;
  email: string;
  onUnlocked: (session: AuthSession) => void;
  onRestoreBackup: () => void;
  onStartOver: () => void;
  onSignOut: () => void;
}) {
  const phraseId = useId();
  const [panel, setPanel] = useState<Panel>('kit');
  const [phrase, setPhrase] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [oldVersion, setOldVersion] = useState<Extract<RecoveryResult, { status: 'old-version' }> | null>(null);
  const [restored, setRestored] = useState<AuthSession | null>(null);
  const [understood, setUnderstood] = useState(false);

  async function run(attempt: () => Promise<RecoveryResult>) {
    setError('');
    setBusy(true);
    try {
      const result = await attempt();
      setPhrase('');
      setOldPassword('');
      if (result.status === 'old-version') setOldVersion(result);
      else if (result.restoredKeys) setRestored(result.session);
      else onUnlocked(result.session);
    } catch (err) {
      setError(errorText(err, 'Não foi possível abrir os dados.'));
    } finally {
      setBusy(false);
    }
  }

  async function restoreOldVersion() {
    if (!oldVersion) return;
    setError('');
    setBusy(true);
    try {
      onUnlocked(await oldVersion.commit());
    } catch (err) {
      setError(errorText(err, 'Não foi possível restaurar esta versão.'));
      setBusy(false);
    }
  }

  if (restored) {
    return (
      <AuthPage title="Dados abertos com o kit">
        <Notice tone="warning">
          As chaves da sua conta na nuvem tinham sido alteradas e foram restauradas com o seu kit. Se você não trocou a
          senha, alguém pode ter usado o seu e-mail: troque a senha do e-mail. Depois, gere um kit novo em Configurações.
        </Notice>
        <PrimaryButton type="button" onClick={() => onUnlocked(restored)}>
          Continuar
        </PrimaryButton>
      </AuthPage>
    );
  }

  if (oldVersion) {
    const when = formatDateTime(oldVersion.createdAt);
    return (
      <AuthPage title="Este kit abre uma versão antiga">
        <div role="alert" className="mt-4 space-y-2 text-sm leading-6 text-slate-300">
          <p>
            Este kit é de uma época anterior das chaves da conta. Ele não abre os dados atuais, mas abre uma cópia guardada
            em <strong className="text-white">{when}</strong>.
          </p>
          <p>
            Os dados dessa cópia correspondem à versão daquela época e podem estar desatualizados. Restaurar substitui os
            dados atuais na nuvem, que este kit não consegue abrir.
          </p>
          <p className="text-amber-100">Se você tem um kit mais novo, cancele e use-o.</p>
        </div>
        <ErrorMessage message={error} />
        <PrimaryButton type="button" onClick={restoreOldVersion} busy={busy} busyLabel="Restaurando...">
          <History className="h-4 w-4" aria-hidden="true" />
          Restaurar a versão de {when}
        </PrimaryButton>
        <SecondaryButton onClick={() => { setOldVersion(null); setError(''); }} disabled={busy}>
          Cancelar
        </SecondaryButton>
      </AuthPage>
    );
  }

  return (
    <AuthPage
      wide
      title="Abrir dados com o kit"
      subtitle={
        <>
          A senha de <strong className="text-slate-200">{email}</strong> foi redefinida por e-mail. Ela devolve o acesso à
          conta, mas os dados continuam cifrados com a chave anterior.
        </>
      }
    >
      {panel === 'kit' && (
        <form onSubmit={e => { e.preventDefault(); void run(() => provider.unlockWithKit(phrase)); }} noValidate>
          <div className="mt-4">
            <label htmlFor={phraseId} className="text-xs font-bold uppercase tracking-wide text-slate-400">
              As 12 palavras do kit, na ordem
            </label>
            <textarea
              id={phraseId}
              value={phrase}
              onChange={e => { setPhrase(e.target.value); setError(''); }}
              rows={3}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              disabled={busy}
              className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 font-mono text-sm text-slate-100 outline-none transition focus:border-cyan-200/40 focus-visible:ring-2 focus-visible:ring-cyan-300/50"
            />
          </div>
          <ErrorMessage message={error} />
          <PrimaryButton busy={busy} busyLabel="Testando o kit (pode levar alguns segundos)...">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Abrir meus dados
          </PrimaryButton>
        </form>
      )}

      {panel === 'old-password' && (
        <form onSubmit={e => { e.preventDefault(); void run(() => provider.unlockWithOldPassword(oldPassword)); }} noValidate>
          <PasswordField
            label="Senha antiga"
            value={oldPassword}
            onChange={v => { setOldPassword(v); setError(''); }}
            autoComplete="current-password"
            autoFocus
            disabled={busy}
          />
          <ErrorMessage message={error} />
          <PrimaryButton busy={busy} busyLabel="Testando a senha antiga...">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Abrir com a senha antiga
          </PrimaryButton>
          <SecondaryButton onClick={() => { setPanel('kit'); setError(''); }} disabled={busy}>
            Usar o kit
          </SecondaryButton>
        </form>
      )}

      {(panel === 'start-over' || panel === 'start-over-confirm') && (
        <div className="mt-4">
          <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-100">
            Os dados antigos continuarão cifrados e ninguém conseguirá abri-los. A conta recomeça vazia, com um kit novo.
          </p>
          {panel === 'start-over' ? (
            <>
              <SecondaryButton onClick={() => setPanel('start-over-confirm')}>Quero começar do zero</SecondaryButton>
              <SecondaryButton onClick={() => setPanel('kit')}>Voltar</SecondaryButton>
            </>
          ) : (
            <>
              <label className={`mt-4 flex items-start gap-3 rounded-xl p-2 text-sm text-slate-300 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan-300`}>
                <input
                  type="checkbox"
                  checked={understood}
                  onChange={e => setUnderstood(e.target.checked)}
                  className="mt-1 h-4 w-4 accent-rose-400"
                />
                Entendo que os dados antigos continuarão cifrados e ninguém conseguirá abri-los.
              </label>
              <button
                type="button"
                onClick={onStartOver}
                disabled={!understood}
                className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white transition disabled:opacity-40 ${FOCUS_RING}`}
                style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Começar do zero
              </button>
              <SecondaryButton onClick={() => { setPanel('kit'); setUnderstood(false); }}>Voltar</SecondaryButton>
            </>
          )}
        </div>
      )}

      {panel === 'kit' && (
        <div className="mt-6 border-t border-white/10 pt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Sem o kit</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <button type="button" onClick={() => { setPanel('old-password'); setError(''); }} disabled={busy} className={`rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50 ${FOCUS_RING}`}>
              Lembrei a senha antiga
            </button>
            <button type="button" onClick={onRestoreBackup} disabled={busy} className={`inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:opacity-50 ${FOCUS_RING}`}>
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              Restaurar de um backup
            </button>
            <button type="button" onClick={() => { setPanel('start-over'); setError(''); }} disabled={busy} className={`rounded-xl border border-rose-400/20 bg-rose-500/[0.06] px-3 py-2.5 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/[0.12] disabled:opacity-50 ${FOCUS_RING}`}>
              Começar do zero
            </button>
          </div>
        </div>
      )}

      <SecondaryButton onClick={onSignOut} disabled={busy}>
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Sair
      </SecondaryButton>
    </AuthPage>
  );
}

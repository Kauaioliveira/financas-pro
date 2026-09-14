import { useEffect, useRef, useState } from 'react';
import { FilePlus2, Loader2, Upload } from 'lucide-react';
import type { AuthSession } from '../../lib/auth';
import type { VaultSetup } from '../../lib/cloud/cloudAuthProvider';
import type { VaultData } from '../../lib/vault';
import { backupToVaultData } from '../../utils/backup';
import type { BackupData } from '../../utils/backup';
import { BackupImport } from '../BackupImport';
import { KitWordConfirmation, RecoveryKitSheet } from '../auth/RecoveryKit';
import { AuthPage, ErrorMessage, PrimaryButton, SecondaryButton } from './CloudUi';
import { errorText } from './errorText';

type Step = 'preparing' | 'kit' | 'confirm' | 'start' | 'backup' | 'saving';

/** setup: new vault. restore-backup / start-over: new key and kit that replace data the user cannot open. */
export type VaultSetupPurpose = 'setup' | 'restore-backup' | 'start-over';

/**
 * "Configurar cofre": show and print the kit, confirm 3 words, then create the
 * vault empty or with a backup (how data from the local app reaches the site).
 * The same steps give a new kit when the old data cannot be opened.
 */
export function VaultSetupScreen({
  prepare,
  purpose,
  email,
  onReady,
  onCancel,
}: {
  prepare: () => Promise<VaultSetup>;
  purpose: VaultSetupPurpose;
  email: string;
  onReady: (session: AuthSession) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<Step>('preparing');
  const [setup, setSetup] = useState<VaultSetup | null>(null);
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    prepare().then(
      prepared => {
        setSetup(prepared);
        setStep('kit');
      },
      err => setError(errorText(err, 'Não foi possível preparar o cofre.')),
    );
  }, [prepare]);

  async function create(data: VaultData) {
    if (!setup) return;
    setError('');
    setStep('saving');
    try {
      onReady(await setup.commit(data));
    } catch (err) {
      setError(errorText(err, 'Não foi possível criar o cofre.'));
      setStep(purpose === 'start-over' ? 'confirm' : purpose === 'restore-backup' ? 'backup' : 'start');
      throw err;
    }
  }

  if (!setup) {
    return (
      <AuthPage title="Configurar cofre">
        {error ? (
          <>
            <ErrorMessage message={error} />
            <SecondaryButton onClick={onCancel}>Voltar ao login</SecondaryButton>
          </>
        ) : (
          <p role="status" className="mt-4 flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Gerando o kit de recuperação...
          </p>
        )}
      </AuthPage>
    );
  }

  if (step === 'kit') {
    return (
      <AuthPage
        wide
        title={purpose === 'setup' ? 'Configurar cofre: kit de recuperação' : 'Kit de recuperação novo'}
        subtitle={
          <>
            Se você esquecer a senha, o e-mail devolve o acesso à conta, mas{' '}
            <strong className="text-white">só estas 12 palavras devolvem os seus dados</strong>. Imprima o kit ou anote as
            palavras na ordem e guarde longe do computador.
          </>
        }
      >
        <div className="mt-5">
          <RecoveryKitSheet accountName={email} phrase={setup.phrase} kitId={setup.kitId} createdAt={setup.kitCreatedAt} variant="cloud" />
        </div>
        <PrimaryButton type="button" onClick={() => setStep('confirm')}>
          Já guardei, confirmar palavras
        </PrimaryButton>
      </AuthPage>
    );
  }

  if (step === 'confirm') {
    return (
      <AuthPage wide title="Confirme o seu kit" subtitle="Digite as palavras destas posições.">
        <div className="mt-5">
          <KitWordConfirmation
            phrase={setup.phrase}
            onConfirmed={() => {
              if (purpose === 'start-over') void create({}).catch(() => undefined);
              else setStep(purpose === 'restore-backup' ? 'backup' : 'start');
            }}
            onBack={() => setStep('kit')}
            confirmLabel={purpose === 'start-over' ? 'Confirmar e começar do zero' : 'Confirmar palavras'}
            busyLabel="Confirmando..."
          />
          <ErrorMessage message={error} />
        </div>
      </AuthPage>
    );
  }

  if (step === 'saving' && purpose === 'start-over') {
    return (
      <AuthPage title="Kit de recuperação novo">
        <p role="status" className="mt-5 flex items-center gap-2 text-sm text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Criando o cofre novo...
        </p>
      </AuthPage>
    );
  }

  return (
    <AuthPage
      wide
      title={purpose === 'restore-backup' ? 'Restaurar de um backup' : 'Como quer começar?'}
      subtitle={
        purpose === 'restore-backup'
          ? 'Escolha o arquivo de backup. Ele passa a ser o conteúdo da conta, protegido pelo kit novo.'
          : 'Para trazer os dados do app que você usa no computador, exporte um backup lá (Configurações → Exportar backup) e escolha o arquivo aqui.'
      }
    >
      <ErrorMessage message={error} />
      {step === 'saving' ? (
        <p role="status" className="mt-5 flex items-center gap-2 text-sm text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Criando o cofre cifrado...
        </p>
      ) : step === 'backup' ? (
        <div className="mt-4">
          <BackupImport
            startLabel="Escolher arquivo de backup"
            replaceWarning={null}
            successMessage="Backup importado."
            onImport={json => create(backupToVaultData(JSON.parse(json) as BackupData))}
          />
          {purpose === 'setup' ? (
            <SecondaryButton onClick={() => { setError(''); setStep('start'); }}>Voltar</SecondaryButton>
          ) : (
            <SecondaryButton onClick={onCancel}>Cancelar</SecondaryButton>
          )}
        </div>
      ) : (
        <>
          <PrimaryButton type="button" onClick={() => { void create({}).catch(() => undefined); }}>
            <FilePlus2 className="h-4 w-4" aria-hidden="true" />
            Começar vazio
          </PrimaryButton>
          <SecondaryButton onClick={() => setStep('backup')}>
            <Upload className="h-4 w-4" aria-hidden="true" />
            Começar com um backup
          </SecondaryButton>
        </>
      )}
    </AuthPage>
  );
}

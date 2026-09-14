import { MailCheck } from 'lucide-react';
import { AuthPage, PrimaryButton } from './CloudUi';

export function ConfirmEmailScreen({ email, onContinue }: { email: string; onContinue: () => void }) {
  return (
    <AuthPage title="Confirme seu e-mail">
      <div className="mt-4 flex items-start gap-3">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-cyan-500/12 text-cyan-200 ring-1 ring-inset ring-cyan-400/18">
          <MailCheck className="h-5 w-5" aria-hidden="true" />
        </div>
        <div role="status" className="text-sm leading-6 text-slate-300">
          <p>
            Se <strong className="text-white">{email}</strong> puder usar o FinançasPro, enviamos um link de confirmação
            para ele.
          </p>
          <p className="mt-2 text-slate-400">
            Abra o link <strong className="text-slate-200">neste mesmo navegador</strong>. Depois, entre com a sua
            senha para configurar o cofre. Não chegou? Confira o spam e se o e-mail está na lista do beta.
          </p>
        </div>
      </div>
      <PrimaryButton type="button" onClick={onContinue}>
        Já confirmei, entrar
      </PrimaryButton>
    </AuthPage>
  );
}

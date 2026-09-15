# Supabase: passo a passo do dono

Este guia liga o FinançasPro ao Supabase para você usar o app publicado em mais de um aparelho.
Baseado no §9 de `docs/pesquisa/deploy-e-banco-gratis-2026-09-14.md`.

> **Faça tudo primeiro num projeto de teste.** Só depois de passar pela lista de aceitação
> no fim deste guia, repita num projeto de produção. O plano Free permite 2 projetos ativos.

Tempo estimado: 40 minutos. Custo: R$ 0, sem cartão.

## O que o servidor guarda (e o que não guarda)

| Fica no Supabase | Nunca sai do seu navegador |
|---|---|
| Seu e-mail | Sua senha |
| Um "segredo de login" derivado da senha (o Supabase guarda um bcrypt dele) | A chave que abre os dados |
| O cofre **cifrado** e os embrulhos de chave (também cifrados) | As 12 palavras do kit |
| Até 7 cópias antigas do cofre e o histórico dos embrulhos de chave (tudo dos últimos 30 dias; passado isso, as 10 versões mais recentes) | |

Consequência: redefinir a senha por e-mail devolve **o acesso à conta**. **Só o kit de
recuperação devolve os dados.**

## Antes de tudo

1. No app local (`http://localhost:5173`): Configurações → **Exportar backup**. Guarde o arquivo
   `.financas.enc` e anote com qual kit ou senha ele abre. É assim que seus dados vão para o site.
2. Ligue a verificação em duas etapas no GitHub, se ainda não estiver ligada.

## 1. Criar o projeto

1. Crie a conta em [supabase.com](https://supabase.com) (pode entrar com o GitHub).
2. Ligue a verificação em duas etapas: Account → Security.
3. **New project**:
   - nome: `financaspro-teste` (depois, `financaspro`);
   - região: **South America (São Paulo)** (`sa-east-1`);
   - senha do banco: gere uma forte e guarde num gerenciador de senhas. **Nunca no repositório**;
   - se aparecer **"Automatically expose new tables"**, deixe **desmarcado**. O SQL dá as permissões
     uma a uma.

## 2. Rodar o SQL

1. Abra **SQL Editor → New query**.
2. Cole o conteúdo inteiro de `supabase/migrations/0001_init.sql` e clique **Run**.
   Deve terminar sem erro.
3. **Só no projeto de teste:** abra outra query, cole `supabase/tests/0001_init_check.sql` e clique
   **Run**. O resultado deve ser `OK: todas as verificações passaram`. O script roda dentro de uma
   transação com `rollback`, então não deixa nada gravado. Se aparecer `FALHA: ...`, pare e me mande
   a mensagem.
4. Inclua o seu e-mail na lista do beta (sempre em minúsculas):

   ```sql
   insert into public.beta_allowlist (email, note) values ('seu-email@gmail.com', 'dono');
   ```

> **Aviso honesto:** este SQL foi revisado com cuidado, mas **não foi executado** por quem o
> escreveu (não havia Postgres disponível). O script de verificação existe exatamente para você
> confirmar no projeto de teste.

## 3. Ligar a lista fechada do beta

1. **Authentication → Hooks** (em alguns painéis: Auth Hooks).
2. **Before User Created** → **Add hook** → tipo **Postgres** → schema `public` → função
   `hook_beta_allowlist` → salvar.
3. Teste: tente criar conta no app com um e-mail fora da lista. Deve aparecer "Cadastro fechado:
   este e-mail ainda não está na lista do beta."

## 4. Regras de login por e-mail

Em **Authentication → Sign In / Providers → Email**:

- **Email**: ligado.
- **Confirm email**: ligado.
- **Secure email change**: ligado.
- **Minimum password length**: 8 (qualquer valor até 43 serve).
- **Password requirements**: **sem exigência de caracteres** ("No required characters").
  O app não manda a sua senha: manda um segredo derivado de 43 caracteres (letras, números,
  `-` e `_`). Exigir símbolos quebraria o cadastro. A regra de força (mínimo 12 caracteres e lista
  de senhas comuns) é aplicada no próprio app.
- Se existir a opção "exigir senha atual para trocar a senha", deixe **desligada**; o fluxo de
  "Esqueci a senha" depende disso.

Em **Authentication → Sign In / Providers**, deixe desligados os provedores que você não usa
(telefone, Google etc.).

### Nunca troque o e-mail de uma conta

O "sal" que protege a senha é derivado do e-mail. **Se o e-mail de uma conta mudar, a senha
para de funcionar e os dados deixam de abrir com ela.**

- O app não oferece troca de e-mail.
- Não altere e-mails em Authentication → Users.
- Mantenha **Secure email change** ligado: qualquer pedido de troca exige confirmação nos dois
  endereços, o que dificulta uma troca por engano ou por terceiros.
- O painel do Supabase **não tem** um botão para proibir a troca de e-mail de vez. Se ela acontecer,
  a solução é voltar o e-mail ao valor anterior em Authentication → Users. A senha e o kit voltam a
  funcionar.

## 5. E-mail (SMTP do Gmail)

O e-mail embutido do Supabase só envia 2 mensagens por hora e só para membros do projeto. Para
confirmação de cadastro e "Esqueci a senha" funcionarem, use um Gmail dedicado.

1. Crie um Gmail só para isso (ex.: `financaspro.beta@gmail.com`).
2. Ligue a verificação em duas etapas nessa conta.
3. Em [myaccount.google.com](https://myaccount.google.com) → **Senhas de app**, gere uma senha de app.
   Ela fica **só** no painel do Supabase: nunca no repositório, no `.env` ou em mensagens.
4. No Supabase: **Authentication → Emails → SMTP Settings** → ligue **Custom SMTP**:
   - Host: `smtp.gmail.com`
   - Porta: `587`
   - Usuário: o Gmail dedicado
   - Senha: a senha de app
   - Remetente: o mesmo Gmail; nome "FinançasPro (beta)"
5. Em **Rate Limits**, mantenha 30 e-mails por hora.
6. Em **Authentication → Emails → Templates**, traduza:
   - **Confirm signup**: "Confirme seu e-mail para usar o FinançasPro."
   - **Reset password**: "Este link devolve o acesso à conta. Seus dados só voltam com o kit de
     recuperação."
   - Mantenha o `{{ .ConfirmationURL }}` nos dois modelos.
   - Se existir a notificação de segurança **Password changed**, ligue.

O Gmail aceita até 500 mensagens por dia. É suficiente para o beta.

## 6. Endereços do site

Em **Authentication → URL Configuration**:

- **Site URL**: a URL publicada na Cloudflare (ex.: `https://financaspro.<sua-conta>.workers.dev`;
  como publicar: `docs/deploy/cloudflare.md`).
  Enquanto ela não existir, use `http://localhost:5173`.
- **Redirect URLs**: a URL publicada, `http://localhost:5173` e `http://localhost:4173`.

Os links de confirmação e de redefinição de senha só funcionam para endereços desta lista.

## 7. Chaves para o app

Em **Project Settings → API Keys**:

- copie a **Project URL** (ex.: `https://abcd1234.supabase.co`);
- copie a **Publishable key** (`sb_publishable_...`). Se o projeto só mostrar as chaves antigas,
  use a **anon public**.

**Nunca copie a Secret key (`sb_secret_...`) nem a `service_role`.** Elas ignoram todas as regras
de acesso. O build falha se alguma delas aparecer no JavaScript publicado.

Para desenvolver no seu computador em modo nuvem, crie `C:\Projects\financas-pro\.env.local`
(o `.gitignore` já impede o commit):

```dotenv
VITE_SUPABASE_URL=https://abcd1234.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

Sem essas variáveis, o app continua 100% local, como sempre foi. `VITE_FORCE_LOCAL=true` força o
modo local mesmo com elas preenchidas.

## 8. Lista de aceitação (primeiro no projeto de teste)

Faça em janela anônima, com o site rodando (`npm run dev` com o `.env.local`, ou o site publicado):

1. Criar conta com o seu e-mail → chega o e-mail de confirmação → clicar no link.
2. Digitar a senha → **Configurar cofre** → imprimir o kit → confirmar as 3 palavras.
3. Escolher **Começar com um backup** → informar o arquivo do passo "Antes de tudo" → conferir o painel.
4. Abrir em outro navegador ou no celular → entrar → ver os mesmos dados.
5. Editar nos dois aparelhos quase ao mesmo tempo → o app deve perguntar qual versão manter.
   Nada pode sumir sem você escolher.
6. Desligar a internet → editar → aparece "sem sincronizar" → religar → os dados sobem.
7. **Esqueci a senha** → link do e-mail → nova senha → digitar o kit → dados de volta. Peça e abra o
   link **no mesmo navegador**: o fluxo PKCE guarda ali o verificador, e o link falha em outro aparelho.
8. Configurações → **Gerar kit novo** → sair → "Esqueci a senha" de novo → em "Abrir dados com o kit",
   digitar o kit **antigo**: o app deve avisar que ele só abre uma cópia antiga (com a data) e pedir
   confirmação antes de restaurá-la. Cancele e use o kit **novo**: ele abre os dados atuais.
9. Tentar criar conta com um e-mail fora da allowlist → deve ser recusado.

Passou tudo? Repita as seções 1 a 7 no projeto de produção.

## Se algo der errado

| O que aparece | O que fazer |
|---|---|
| "Cadastro fechado: este e-mail ainda não está na lista do beta." | Inclua o e-mail em `beta_allowlist`, sempre em minúsculas. Se a mensagem aparecer para um e-mail que **está** na lista, confira o hook da seção 3. |
| O e-mail de confirmação ou de redefinição não chega | Confira o SMTP (seção 5), o limite de e-mails por hora e a caixa de spam. Sem Custom SMTP, o Supabase só envia para membros do projeto. |
| "O link do e-mail expirou ou já foi usado. Peça outro." | Peça o link no navegador em que você vai usá-lo e abra-o nesse mesmo navegador. Confira também Redirect URLs (seção 6). |
| "E-mail ou senha incorretos." numa conta que funcionava | Alguém alterou o e-mail em Authentication → Users. Volte o e-mail ao valor anterior: a senha e o kit voltam a funcionar. |
| "A nuvem respondeu com um erro. Tente de novo em instantes." ao gerar kit novo ou trocar senha | Pode ser o teto de 20 trocas de chave em 24 h (`too_many_key_changes` no banco). Espere e tente de novo; o app ainda não traduz esse erro. |
| "Os dados na nuvem mudaram em outro aparelho." ao gerar kit novo | Espere o selo mostrar **Sincronizado** nos dois aparelhos e gere de novo. Nada foi alterado. |
| O projeto aparece como **Paused** no painel | **Resume project**. Nada é apagado; há até 1 ano para reativar. |
| `FALHA: ...` no script de verificação | Não use esse projeto. Mande a mensagem inteira para quem mantém o repositório. |

## Rotina

- **Pausa por inatividade:** o Free pausa após 7 dias com pouca atividade e manda e-mail antes.
  Usar o app evita. Se pausar: painel → **Resume project** (há até 1 ano para isso).
- **Backups:** o plano Free não faz backup automático. Exporte um backup no app de vez em quando.
- **Convidar alguém:** `insert into public.beta_allowlist (email) values ('amigo@exemplo.com');`
- **Excluir uma conta a pedido:** Authentication → Users → apagar o usuário. Cofre, históricos e
  opiniões somem em cascata.
- **Se alguém sobrescrever suas chaves** (por exemplo, depois de tomar seu e-mail): troque a senha do
  e-mail, redefina a senha do app e use **Abrir dados com o kit**. O app tenta o kit em todas as
  versões de chave que o servidor ainda guarda: tudo dos últimos 30 dias e, antes disso, as 10 mais
  recentes. O banco também recusa mais de 20 trocas de chave em 24 h, para que uma rajada de trocas
  não empurre a chave boa para fora do histórico.

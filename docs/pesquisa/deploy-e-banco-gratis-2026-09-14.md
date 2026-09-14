# FinançasPro: publicar grátis, com banco na nuvem e sem quebrar a privacidade

Pesquisa feita em **2026-09-14**. Todos os dados externos abaixo foram vistos nesta data.

**A busca funcionou.** Não consegui ler estas páginas:
- o fórum da Cloudflare sobre uso comercial (erro 403);
- a página de preços do registro.br (veio vazia; usei o resumo da busca);
- o texto completo dos termos da Netlify e da Vercel sobre cartão de crédito.

Onde isso afeta uma conclusão, eu aviso.

**Base local lida:**
- `src/lib/crypto/crypto.ts`, `constants.ts`
- `src/lib/auth/types.ts`, `localAuthProvider.ts`
- `src/context/AuthContext.tsx`, `FinanceContext.tsx`
- `src/utils/secureStorage.ts`, `backup.ts`
- `index.html`, `public/_headers`, `.gitignore`
- `.github/workflows/ci.yml`, `playwright.config.ts`, `e2e/smoke.spec.ts`
- `scripts/FinancasPro.bat`, `README.md`

**Relatórios anteriores (não repito o que já está neles):**
- `docs/pesquisa/mvp-para-produto-2026-09-10.md`: privacidade e custo zero são o diferencial do produto.
- `docs/pesquisa/recuperacao-de-conta-2026-09-13.md`: kit de recuperação, limites do NIST, LGPD (Resoluções 2/2022, 15/2024 e 19/2024), preços de canais e o caso Proton ("e-mail recupera a conta, não os dados").

**O que este relatório acrescenta:**
- hospedagem e banco com dados de hoje;
- como separar "senha para o servidor" de "chave dos dados";
- o protocolo de sincronização;
- o SQL completo;
- os fluxos;
- a Hostinger, a pedido do dono;
- um plano de implementação em commits.

---

## Resposta curta

**Stack recomendada, a R$ 0 e sem cartão:**
- **Cloudflare Workers** servindo só os arquivos estáticos do Vite, com deploy automático pelo GitHub.
- **Supabase Free** na região **São Paulo (sa-east-1)** para login por e-mail e para guardar **um único cofre cifrado por usuário**. O isolamento é feito por RLS e por funções SQL, **sem nenhum servidor próprio**.
- **Uma conta Gmail dedicada** (senha de app) como SMTP, para os e-mails de confirmação e de redefinição de senha.

**Como a senha é usada.** A senha nunca vai ao servidor. O navegador deriva dela duas chaves independentes (o mesmo padrão do Bitwarden):
1. uma credencial, que o Supabase guarda como se fosse a "senha";
2. uma chave que embrulha a chave dos dados.

Por isso a redefinição por e-mail devolve **o acesso à conta**, mas **só o kit devolve os dados**.

**Hostinger:** não vale pagar agora. Ela não traz nada essencial que o plano grátis não tenha. Para banco, ela obrigaria a escrever e manter um backend de login num app financeiro.

---

## Premissas que precisam de ajuste antes

1. **"Os dados do dono migram sozinhos para a nuvem" não é verdade.**
   - O dono usa o app em `http://localhost:5173` (`scripts/FinancasPro.bat:10-12`).
   - O `localStorage` é separado por origem, então o site publicado **não enxerga** as contas que estão no localhost.
   - O caminho universal é **exportar o backup** no app local e **importar** no app publicado. O plano abaixo trata disso.

2. **"Reset de senha por e-mail" no Supabase não pode receber a senha real do usuário.** Se receber, o servidor passa a ver o segredo de que a chave dos dados deriva. Na prática, o provedor precisa receber só uma credencial derivada, e a interface `AuthProvider` precisa mudar:
   - hoje ela é síncrona e identifica o usuário por `userId` numa lista local (`src/lib/auth/types.ts:17-27`);
   - na nuvem, o login é por e-mail e todas as chamadas são assíncronas.

3. **O kit renovável da decisão 3 ainda não existe no código.** A frase é gerada só no cadastro (`src/components/auth/RegisterScreen.tsx:47-52`) e não há como renová-la. Ele entra no plano como entrega própria, antes da nuvem.

4. **Supabase Free "pausa", mas não apaga.**
   - A regra atual é: pausa depois de 7 dias com pouca atividade no banco.
   - O projeto pode ser restaurado **por até 1 ano**, "including data and configurations".
   - Relatos antigos falam em 90 dias; isso está desatualizado.
   - O uso diário do dono basta para evitar a pausa: "a few user requests to the database each day".

---

## O que foi apurado

### No código (verificado em 2026-09-14)
- **CSP:** hoje `connect-src 'self'` e fontes do Google (`index.html:8`, `:11`).
  - Carregar a fonte de `fonts.googleapis.com` envia o IP de cada visitante ao Google. Com `no-referrer` (`index.html:10`) não vai a URL, mas o IP vai. **Inferência:** isso contradiz um pouco a promessa de privacidade.
- **Cabeçalhos HTTP:** `public/_headers` já existe no formato Cloudflare/Netlify, com `X-Frame-Options: DENY` e outros (`public/_headers:1-5`). O Vite copia `public/` para `dist/`.
- **Derivação atual:**
  - PBKDF2-SHA256 com 310.000 iterações (`src/lib/crypto/constants.ts:1`) e salt aleatório guardado no envelope (`crypto.ts:118-137`).
  - Metade dos bits embrulha a `dataKey`; a outra metade vira `verifier` (`crypto.ts:32-54`).
  - O envelope aceita `iterations` por conta (`crypto.ts:139-148`), o que permite subir as iterações sem quebrar contas antigas.
- **O cofre é um único blob:** `saveVaultData` cifra o JSON inteiro de uma vez (`src/utils/secureStorage.ts:22-30`). O `FinanceContext` salva tudo 300 ms depois de cada mudança (`src/context/FinanceContext.tsx:179-191`). Isso já é o modelo "blob único".
- **Faturas pagas duplicam compras dentro do cofre:** marcar uma fatura como paga guarda a fatura inteira, com o array `purchases` (`FinanceContext.tsx:244-249`; tipo em `src/types/index.ts:48-61`). **Inferência:** isso infla o blob.
- **Todo registro tem `id`:** `Transaction`, `CardAccount`, `CardPurchase`, `CardInvoice` (`src/types/index.ts:9-61`) e `CategoryRule` (`:121-126`). É isso que permite fundir alterações por `id` sem mudar o modelo.
- **Testes e CI:**
  - Vitest roda em Node com `localStorage` em memória (`src/test/setup.ts`).
  - O E2E roda sobre `npm run preview` (`playwright.config.ts:10-14`) e cobre cadastro, login e backup (`e2e/smoke.spec.ts`).
  - A CI não tem variáveis de ambiente (`.github/workflows/ci.yml`).
  - Hoje nada no código lê `import.meta.env`, exceto `PROD` (`secureStorage.ts:35`, `storage.ts:36`).
- **`.gitignore`** já bloqueia `.env`, `.env.*` (menos `.env.example`), `*.pem` e `*.key` (`.gitignore`, bloco final).
- **O repositório `Kauaioliveira/financas-pro` é público** (`gh repo view`, visibilidade PUBLIC).

### Hospedagem do front
- **Cloudflare Workers (static assets):**
  - "Requests to static assets are free and unlimited".
  - Plano grátis com 100.000 requisições/dia de *script*; o pago começa em US$ 5/mês ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)).
  - SPA: `"not_found_handling": "single-page-application"` ([SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)).
  - `_headers` com até 100 regras, que **não** se aplicam a respostas geradas por código de Worker ([headers](https://developers.cloudflare.com/workers/static-assets/headers/)).
- **Recomendação oficial da Cloudflare:** "Workers supports most Pages use cases [...] Start new projects with Workers" ([Pages](https://developers.cloudflare.com/pages/)).
- **Workers Builds:**
  - grátis com 3.000 minutos de build/mês, 1 build por vez e 20 min de timeout ([limits](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/));
  - as variáveis de build "are provided as environment variables during the build process" e "will not be accessible at runtime" ([configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/));
  - o nome do Worker no painel precisa ser igual ao `name` do arquivo Wrangler ([builds](https://developers.cloudflare.com/workers/ci-cd/builds/)).
- **Cloudflare Pages (alternativa):**
  - 500 builds/mês, 20.000 arquivos, 25 MiB por arquivo, 100 domínios por projeto ([limits](https://developers.cloudflare.com/pages/platform/limits/));
  - sem `404.html`, assume SPA ([serving pages](https://developers.cloudflare.com/pages/configuration/serving-pages/)).
- **Uso comercial na Cloudflare:** **não encontrei proibição** nas páginas oficiais que li. Uma fonte secundária afirma "commercial use allowed" ([resultado de busca, eastondev/freetiers](https://www.freetiers.com/directory/cloudflare-workers)). O fórum oficial deu 403. **Não confirmado na fonte primária.**
- **Vercel Hobby:**
  - "restricted to non-commercial personal use only".
  - Comercial é "any Deployment that is used for the purpose of financial gain of **anyone** involved in **any part of the production**". Doações não contam ([fair use](https://vercel.com/docs/limits/fair-use-guidelines), atualizado em 2026-07-29).
  - Limites: 1.000.000 edge requests, 100 deploys/dia, 100 GB de Fast Data Transfer. Estourou, "wait until 30 days have passed" ([Hobby](https://vercel.com/docs/plans/hobby), atualizado em 2026-08-31).
  - Pro: US$ 20 por usuário/mês.
- **GitHub Pages:**
  - site até 1 GB; banda "soft" de 100 GB/mês; 10 builds/h "soft" (não vale para build via Actions);
  - "Not intended for or allowed to be used as a free web-hosting service to run your online business [...] or [...] SaaS" ([limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits));
  - não aceita cabeçalhos HTTP próprios, então só dá para usar CSP por `<meta>`, e `frame-ancestors` é ignorado em `<meta>` ([discussão GitHub](https://github.com/orgs/community/discussions/54257)).
- **Netlify Free:**
  - 300 créditos/mês;
  - deploy de produção custa 15 créditos, banda 20 créditos/GB, requisições 2 créditos a cada 10 mil;
  - Personal a US$ 9/mês ([pricing](https://www.netlify.com/pricing/)).
  - A página **não diz** o que acontece quando os créditos acabam nem fala de uso comercial.

### Banco + autenticação
- **Supabase Free** ([pricing](https://supabase.com/pricing)):
  - US$ 0; 50.000 MAU; banco de 500 MB; 5 GB de egress; 2 projetos ativos;
  - sem backups automáticos; logs de 1 dia;
  - Pro a US$ 25/mês (100.000 MAU, 8 GB, 250 GB de egress, backups de 7 dias), com spend cap ligado por padrão.
- **Pausa no Supabase** ([project pausing](https://supabase.com/docs/guides/platform/free-project-pausing)):
  - pausa depois de 7 dias de baixa atividade, com e-mail de aviso "roughly one week before";
  - restauração "for up to 1 year after it was paused", com dados e configuração.
- **Cotas no Supabase:** ao estourar uma cota há aviso e período de carência. Depois vêm restrições como projeto pausado, banco só leitura ou "402 status code for all API requests" ([billing FAQ](https://supabase.com/docs/guides/platform/billing-faq)).
  - **Cartão:** a documentação oficial não menciona cartão no Free. Fontes secundárias dizem que não exige. **Não confirmado na fonte primária.**
- **Regiões do Supabase:** `sa-east-1 (São Paulo)` está na lista, sem restrição por plano mencionada ([regions](https://supabase.com/docs/guides/platform/regions)).
- **Mudança que afeta o SQL:** desde **30/05/2026**, projetos novos não expõem tabelas novas à Data API automaticamente; em 30/10/2026 isso vale para projetos existentes. É preciso `grant` explícito, e "RLS behavior remains unchanged" ([changelog](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)).
- **Chaves do Supabase:**
  - `sb_publishable_...` é "Safe to expose online"; `sb_secret_...` "bypasses Row Level Security" e só serve no backend;
  - as chaves `anon`/`service_role` serão descontinuadas "by the end of 2026" ([API keys](https://supabase.com/docs/guides/api/api-keys)).
- **RLS no Supabase** ([RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)):
  - usar `to authenticated`;
  - usar `(select auth.uid())` por desempenho;
  - `auth.uid()` é nulo para quem não está logado;
  - não usar `raw_user_meta_data` para autorização.
- **E-mail do Supabase:**
  - o SMTP embutido envia "2 messages per hour" e **só para membros do time do projeto** ([SMTP](https://supabase.com/docs/guides/auth/auth-smtp));
  - com SMTP próprio, começa em 30 mensagens/h, ajustável;
  - redefinição de senha limitada a 1 pedido a cada 60 s por usuário; login e cadastro a 30 req/5 min por IP ([rate limits](https://supabase.com/docs/guides/auth/rate-limits)).
- **Senhas no Supabase:**
  - guardadas com bcrypt ([password security](https://supabase.com/docs/guides/auth/password-security));
  - proteção contra senha vazada só no Pro;
  - limite de 72 caracteres por causa do bcrypt ([discussão Supabase #34207](https://github.com/orgs/supabase/discussions/34207));
  - `resetPasswordForEmail` aceita PKCE, exige `redirectTo` na lista de URLs permitidas e emite o evento `PASSWORD_RECOVERY` ([referência JS](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail));
  - para evitar enumeração, não revela se o e-mail existe ([passwords](https://supabase.com/docs/guides/auth/passwords)).
- **Hooks e notificações do Supabase:**
  - o hook "Before User Created" está disponível no **Free** ([auth hooks](https://supabase.com/docs/guides/auth/auth-hooks));
  - ele rejeita o cadastro devolvendo `{"error":{"message":...,"http_code":403}}` e aceita devolvendo `'{}'::jsonb` ([exemplo oficial](https://raw.githubusercontent.com/supabase/supabase/master/apps/docs/content/guides/auth/auth-hooks/before-user-created-hook.mdx));
  - há modelos de e-mail de segurança como "Password changed", enviados só se ligados no projeto ([email templates](https://supabase.com/docs/guides/auth/auth-email-templates)).
- **Supabase e LGPD:** o DPA do Supabase vale ao aceitar os termos e usa as cláusulas-padrão da UE. **Não menciona Brasil, LGPD nem ANPD** ([DPA](https://supabase.com/legal/dpa)).
- **Firebase Spark:**
  - "No payment method needed"; Auth com 50 mil MAU; Firestore com 1 GiB, 50 mil leituras/dia, 20 mil gravações/dia e 10 GiB/mês de saída; Hosting com 10 GB e 360 MB/dia ([pricing](https://firebase.google.com/pricing));
  - **documento máximo de 1 MiB** ([quotas](https://firebase.google.com/docs/firestore/quotas), atualizado em 2026-09-10);
  - e-mails de redefinição de senha: 150/dia no Spark; verificação de e-mail: 1.000/dia; limite de 3.000 usuários ativos/dia ("Tier 1") ([auth limits](https://firebase.google.com/docs/auth/limits));
  - `southamerica-east1 - São Paulo` disponível ([locations](https://firebase.google.com/docs/firestore/locations));
  - regra de dono: `allow read, write: if request.auth != null && request.auth.uid == userId` ([rules basics](https://firebase.google.com/docs/rules/basics));
  - a página padrão de redefinição fica hospedada no Firebase, e dá para trocar por um *handler* no próprio app com `verifyPasswordResetCode`/`confirmPasswordReset` ([custom email handler](https://firebase.google.com/docs/auth/custom-email-handler));
  - **não encontrei** política de pausa ou exclusão de projeto Spark inativo.
- **Cloudflare D1 + Workers:**
  - D1 grátis com 5 milhões de linhas lidas/dia, 100 mil gravadas/dia e 5 GB no total ([D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/));
  - banco máximo de 500 MB no Free, linha máxima de 2 MB ([D1 limits](https://developers.cloudflare.com/d1/platform/limits/));
  - Worker grátis com 10 ms de CPU por invocação ([pricing](https://developers.cloudflare.com/workers/platform/pricing/));
  - não tem autenticação pronta;
  - o Email Service só envia a destinatários arbitrários no Workers Paid; no Free, só para endereços verificados da própria conta ([Email Service pricing](https://developers.cloudflare.com/email-service/platform/pricing/)).
- **Neon Free:**
  - 0,5 GB por projeto, 5 GB de egress, Neon Auth até 60 mil MAU, sem cartão; o plano pago Launch cobra por uso, sem mínimo ([pricing](https://neon.com/pricing));
  - `aws-sa-east-1` disponível ([regions](https://neon.com/docs/introduction/regions));
  - o computador suspende após 5 min e volta sozinho ([guia Neon vs Supabase](https://neon.com/guides/neon-vs-supabase-free-plan), fonte do próprio Neon, 13/08/2026);
  - **o Managed Better Auth está em Beta**; "SDK methods for password reset [...] are not fully supported yet" ([password reset](https://neon.com/docs/auth/guides/password-reset));
  - o provedor de e-mail compartilhado é "rate-limited" e "does not support verification links" ([checklist](https://neon.com/docs/auth/production-checklist)).
- **Appwrite Cloud Free:**
  - 75 mil MAU, 2 GB de armazenamento, 5 GB de banda, 2 projetos; Pro a partir de US$ 25 ([pricing](https://appwrite.io/pricing));
  - pausa depois de 7 dias **sem atividade de desenvolvimento no Console**, e o tráfego de usuários não conta ([changelog 2026-02-20](https://appwrite.io/changelog/entry/2026-02-20-1));
  - **projetos pausados por 90 dias são apagados** ([changelog 2026-06-29](https://appwrite.io/changelog/entry/2026-06-29)).
- **Turso Free:** 100 bancos, 5 GB, 500 milhões de leituras e 10 milhões de gravações/mês, sem cartão; Developer a US$ 4,99 ([pricing](https://turso.tech/pricing)). A página não fala de autenticação para o navegador.
- **PocketBase:** "full backward compatibility is not guaranteed before reaching v1.0.0" ([GitHub](https://github.com/pocketbase/pocketbase)). Precisa de servidor próprio, backup copiando `pb_data` e SMTP próprio ([produção](https://pocketbase.io/docs/going-to-production/)).

### Separar autenticação de criptografia
- **Bitwarden** ([whitepaper](https://bitwarden.com/help/bitwarden-security-white-paper/)):
  - Master Key = PBKDF2 com 600.000 iterações e "salt of the user's email address";
  - a Master Key é esticada por HKDF e cifra a chave simétrica;
  - o hash enviado ao servidor é PBKDF2 da Master Key com a senha como salt;
  - no servidor, esse hash passa de novo por PBKDF2 com salt aleatório e 600.000 iterações.
- **1Password** ([security design](https://agilebits.github.io/security-design/deepKeys.html), [SRP](https://support.1password.com/secure-remote-password/)):
  - a chave que abre a conta (AUK) e o segredo de autenticação (SRP-x) saem da senha + Secret Key com "an entirely independent salt";
  - o servidor guarda só o *verifier* SRP e autentica sem receber a senha.
- **OWASP** ([cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)):
  - PBKDF2-HMAC-SHA256: "600,000 iterations";
  - bcrypt tem limite de 72 bytes.
- **NIST SP 800-63B-4 §3.1.1.2** ([HTML](https://pages.nist.gov/800-63-4/sp800-63b.html)):
  - senha como fator único "SHALL" ter no mínimo 15 caracteres;
  - o verificador deve checar contra lista de senhas comuns ou vazadas.

### Sincronização e navegador
- `CompressionStream` é "Widely available since May 2023" e funciona em Web Workers ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream)).
- **Actual Budget** (app de orçamento *local-first*): usa CRDT e log de mudanças no servidor, com E2E opcional ([sync](https://actualbudget.org/docs/getting-started/sync/)). É a referência do caminho "registro a registro". Não copio.
- **Tamanho do blob.** Medi com dados sintéticos, usando Node e os tipos reais. A premissa é minha: 150 lançamentos/mês + 100 compras de cartão/mês por 3 anos, ou seja, 5.400 + 3.600 registros.

| Formato | Tamanho |
|---|---|
| JSON | 2,04 MB |
| Cifrado, em base64 | 2,73 MB |
| **Com gzip antes de cifrar** | 0,23 MB (**0,31 MB** em base64) |

  Os IDs aleatórios comprimem mal, então o número é conservador. As faturas pagas duplicadas podem quase dobrar o JSON sem compressão (inferência).

### Canais de e-mail grátis
- **Resend:** Free com 3.000/mês e 100/dia ([pricing](https://resend.com/pricing)). Sem domínio verificado: "You can only send testing emails to your own email address" ([errors](https://resend.com/docs/api-reference/errors)). **Ou seja, exige domínio.**
- **Gmail:** erro ao passar de "500 emails sent in a day" ([Gmail](https://support.google.com/mail/answer/22839?hl=en)). A senha de app exige verificação em duas etapas, e o próprio Google diz que "App passwords aren't recommended" ([App passwords](https://support.google.com/accounts/answer/185833?hl=en)).
  - O guia do Supabase para Google SMTP cita `smtp.gmail.com` nas portas 465 ou 587, com senha de app, mas foi escrito para Google Workspace ([troubleshooting](https://supabase.com/docs/guides/troubleshooting/using-google-smtp-with-supabase-custom-smtp-ZZzU4Y)).
  - Para Gmail pessoal há só relatos secundários. **Média confiança.**
- **Brevo:** Free com 300/dia. Sem domínio autenticado, troca o remetente por `@brevosend.com` (fontes secundárias: [Unspam](https://unspam.email/deliverability/brevo)).
- **Domínio `.br`:** R$ 40/ano pelo resumo da busca no registro.br ([registro.br](https://registro.br/ajuda/pagamento-de-dominio/)). **A página não abriu.**

### Opinião dos testadores e analytics
- **Tally Free:** "Unlimited forms", "Unlimited submissions", "stores all form data in Europe", com marca Tally ([pricing](https://tally.so/pricing)).
- **Cloudflare Web Analytics:**
  - grátis ([about](https://developers.cloudflare.com/web-analytics/about/));
  - "We don't use any client-side state, like cookies or localStorage, for the purposes of tracking users. And we don't 'fingerprint' individuals" ([blog, 29/09/2020](https://blog.cloudflare.com/free-privacy-first-analytics-for-a-better-web/));
  - CSP: `script-src https://static.cloudflareinsights.com/beacon.min.js` e, na instalação manual, `connect-src cloudflareinsights.com`;
  - bloqueadores de anúncio bloqueiam o beacon ([FAQ](https://developers.cloudflare.com/web-analytics/faq/)).

### LGPD (complementa o relatório de 2026-09-13)
- **Art. 7º:** as bases legais incluem "I - mediante o fornecimento de consentimento pelo titular" e "V - quando necessário para a execução de contrato [...] a pedido do titular" ([art. 7º](https://lgpd-brasil.info/capitulo_02/artigo_07)).
- **Art. 9º:** o titular tem direito a saber finalidade, forma e duração, identificação e contato do controlador, uso compartilhado, responsabilidades e direitos do art. 18 ([art. 9º](https://lgpd-brasil.info/capitulo_02/artigo_09)).
- **Art. 33, VIII:** a transferência internacional é permitida com "consentimento específico e em destaque para a transferência, com informação prévia sobre o caráter internacional da operação" ([art. 33](https://lgpd-brasil.info/capitulo_05/artigo_33)).

### Hostinger (pedido do dono; páginas oficiais)
- **Hospedagem de sites** ([hostinger.com/br/hospedagem-de-sites](https://www.hostinger.com/br/hospedagem-de-sites); o endereço `hostinger.com.br` redireciona para lá). Preço promocional exige contrato de **48 meses**:

| Plano | Contratação | Total 48 meses | Renovação |
|---|---|---|---|
| Single | R$ 5,99/mês | R$ 287,52 | R$ 23,99/mês |
| Premium | R$ 10,99/mês | R$ 527,52 | R$ 38,99/mês |
| Unlimited | R$ 13,99/mês | R$ 671,52 | R$ 64,99/mês |
| Cloud Startup | R$ 39,99/mês | R$ 1.919,52 | R$ 129,99/mês |

  - O que vem incluso: Single tem "Domínio grátis"; Premium e superiores têm "Domínio - grátis por 1 ano"; todos têm backups (semanais ou diários) e CDN.
- **Limites dos planos** ([parâmetros](https://www.hostinger.com/support/6976044-parameters-and-limits-of-hosting-plans-in-hostinger/)):

| Plano | MySQL | Apps Node.js | E-mail |
|---|---|---|---|
| Single | 2 bancos | "Not available" | 1 conta |
| Premium | 10 bancos | "Not available" | 2 por site |
| Unlimited | 150 bancos | "5 websites" | 5 por site |
| Cloud | 300 bancos | 10 | 10 por site |

- **Node.js gerenciado:**
  - "Business web hosting plan or any Cloud hosting plan", além de VPS ([opções Node.js](https://www.hostinger.com/support/node-js-hosting-options-at-hostinger/));
  - a página brasileira de aplicações web lista **Unlimited** e **Cloud Startup**, com "Managed MySQL database", Vite e React entre os frameworks e deploy via GitHub ([web apps](https://www.hostinger.com/br/web-apps-hosting)).
- **Deploy pelo GitHub:**
  - "Runs your build script", "On every push" (webhook), diretório de saída configurável (ex.: `dist`);
  - variáveis "injected into both build and runtime";
  - um deploy por vez ([docs GitHub](https://docs.hostinger.com/node.js/github)).
- **VPS** ([servidor-vps](https://www.hostinger.com/br/servidor-vps)). Contrato de **2 anos**:

| Plano | Contratação | Renovação | Recursos |
|---|---|---|---|
| KVM 1 | R$ 29,99/mês | R$ 59,99 | 1 vCPU, 4 GB, 50 GB |
| KVM 2 | R$ 43,99/mês | R$ 77,99 | 2 vCPU, 8 GB, 100 GB |
| KVM 4 | R$ 59,99/mês | R$ 149,99 | não levantado |
| KVM 8 | R$ 119,99/mês | R$ 259,99 | não levantado |

  - **Autogerenciado** ("você é responsável pela manutenção"), com backups semanais grátis e root completo;
  - modelos prontos de **Supabase**, **PocketBase**, Coolify e Docker ([modelo Supabase](https://www.hostinger.com/br/vps/supabase-hosting)).
- **Data center no Brasil:** post de 19/08/2025 anuncia servidores em São Paulo "disponíveis para os planos de hospedagem compartilhada, hospedagem WordPress e Cloud" ([blog Hostinger](https://www.hostinger.com/br/blog/novo-data-center-da-hostinger-no-brasil/)). As páginas de preço não dizem se o Brasil é a região padrão.
- **E-mail:** envio por caixa de 100/dia ("Free Business Email (Deprecated)"), 1.000/dia (Business Starter) e 3.000/dia (Business Premium) ([limites de e-mail](https://www.hostinger.com/support/4625828-parameters-and-limits-of-hostinger-email/)).
- **Supabase auto-hospedado:** você assume "Security hardening and keeping OS and services updated", "Backups and disaster recovery", "Monitoring and uptime". Perde, entre outras coisas, "managed backups and PITR" ([self-hosting](https://supabase.com/docs/guides/self-hosting)).
- **SPA em Apache/LiteSpeed:** a regra `.htaccess` com `RewriteRule . /index.html` resolve o recarregamento de rotas (fonte secundária: [Sujayraj](https://sujayrajboregouda.in/blogs/fixing-react-routing-issue-on-hostinger-a-simple-htaccess-solution)).
- **Suporte em português:** **não verifiquei** em página oficial.

---

## Análise / comparação

### Tabela 1: hospedagem do front (SPA estática)

| Critério | GitHub Pages | **Cloudflare Workers (static assets)** / Pages | Vercel Hobby | Netlify Free | Hostinger compartilhada | Hostinger VPS |
|---|---|---|---|---|---|---|
| **Custo** | R$ 0 | R$ 0 | R$ 0 | R$ 0 | Premium R$ 10,99/mês (48 meses, R$ 527,52 adiantado), renova a R$ 38,99. Com build pelo GitHub: Unlimited R$ 13,99, renova a R$ 64,99 | KVM 1 R$ 29,99/mês (24 meses), renova a R$ 59,99 |
| **Cartão exigido** | Não (repo público) | Não confirmado em fonte oficial (secundária: não) | Não verificado | Não informado | Sim, é pago | Sim, é pago |
| **Pausa por inatividade** | Não | Não encontrei | Estourou limite, espera 30 dias | Não informado ao acabar créditos | Não (enquanto pagar) | Não (enquanto pagar) |
| **Limites** | 1 GB de site, 100 GB/mês (soft) | Requisições a estáticos grátis e ilimitadas; 3.000 min de build/mês; Pages: 20 mil arquivos | 1 milhão de requisições, 100 GB, 100 deploys/dia | 300 créditos/mês (deploy = 15, 1 GB = 20) | 20 GB (Premium); inodes | 50 GB NVMe, 4 TB de banda (KVM 1) |
| **Domínio/HTTPS** | `*.github.io` com HTTPS; domínio próprio | `*.workers.dev` / `*.pages.dev`; domínio próprio | `*.vercel.app` (não reverificado) | `*.netlify.app` (não reverificado) | Domínio grátis (1 ano no Premium) + SSL | Domínio `.cloud` 1 ano; HTTPS por sua conta |
| **Deploy automático pelo GitHub** | Actions | Workers Builds / Git do Pages | Sim | Sim | Só nos planos com Node.js (Unlimited/Cloud) roda `npm run build`. No Premium: Actions + FTP (inferência) | Você monta (Actions + SSH, ou Coolify) |
| **Rotas de SPA** | Truque do `404.html` (inferência) | `not_found_handling: single-page-application` | Rewrites (não reverificado) | `_redirects` (não reverificado) | `.htaccess` (secundária) | Você configura (nginx/Caddy) |
| **Cabeçalhos HTTP (CSP, `frame-ancestors`)** | **Não**, só `<meta>` | **Sim**, `_headers`, que já existe no repo | Sim, `vercel.json` (não reverificado) | Sim, `_headers` (não reverificado) | `.htaccess` (inferência) | Total |
| **Uso comercial no grátis** | **Proibido** para negócio/SaaS | Não encontrei proibição (não confirmado) | **Proibido** | Não informado | Pago, permitido | Pago, permitido |
| **Código de servidor** | Nenhum | Nenhum (só `wrangler.jsonc`) | Nenhum | Nenhum | Nenhum para o front | Configurar e manter servidor web |
| **Servidores no Brasil** | CDN global | CDN global | CDN global | CDN global | São Paulo disponível (blog 08/2025) | Brasil no anúncio antigo; não confirmado na página de preço |
| **Primeiro degrau pago** | — | Workers Paid US$ 5/mês (≈ R$ 26) | Pro US$ 20/usuário/mês | Personal US$ 9/mês | Já é pago | Já é pago |

**Critério que pesa mais aqui: cabeçalhos HTTP próprios somados a uso comercial permitido.**
- **Cabeçalhos:** o app guarda a chave dos dados em memória no navegador. Quem publicar JavaScript malicioso ou embutir o app num iframe ataca justamente a promessa E2E. O CSP e o `frame-ancestors` são a defesa, e o `<meta>` não cobre `frame-ancestors`.
- **Uso comercial:** o dono não quer mudar de host se um dia monetizar. Isso elimina Vercel Hobby e GitHub Pages.
- **Resultado:** a Cloudflare vence, e o repositório já tem `public/_headers` no formato dela.

### Tabela 2: banco + autenticação

| Critério | **Supabase Free** | Firebase Spark | Cloudflare D1 + Workers | Neon Free (+ Neon Auth) | Appwrite Free | Hostinger compartilhada (MySQL) | Hostinger VPS (Supabase ou PocketBase auto-hospedado) |
|---|---|---|---|---|---|---|---|
| **Custo** | R$ 0 | R$ 0 | R$ 0 | R$ 0 | R$ 0 | Com Node.js: Unlimited R$ 13,99, renova a R$ 64,99 | KVM 1 R$ 29,99, renova a R$ 59,99. Supabase completo provavelmente pede KVM 2, R$ 43,99 → R$ 77,99 (inferência) |
| **Cartão** | Docs não mencionam; secundárias: não | "No payment method needed" | Não confirmado | "no credit card required" | Não verificado | Sim | Sim |
| **Pausa / exclusão** | Pausa após 7 dias de pouca atividade no banco; **restaura até 1 ano com dados** | Não encontrei política | Não encontrei | Computador dorme 5 min e acorda sozinho; não encontrei pausa de projeto | **Pausa sem atividade no Console (usuários não contam) e apaga após 90 dias pausado** | Não | Não (você mantém) |
| **Limites** | 500 MB, 50 mil MAU, 5 GB de egress, 2 projetos, sem backup | Firestore 1 GiB, 50 mil leituras e 20 mil gravações/dia; **documento de 1 MiB**; 3 mil DAU no Auth | D1 500 MB por banco, 5 GB total; Worker 10 ms de CPU | 0,5 GB por projeto, 5 GB de egress, 60 mil MAU | 2 GB, 5 GB de banda, 75 mil MAU | 150 bancos (Unlimited) | Disco do VPS |
| **Região São Paulo** | Sim (`sa-east-1`) | Sim (`southamerica-east1`) | Não (global) | Sim (`aws-sa-east-1`) | Não encontrei | Sim (blog 08/2025) | Não confirmado na página |
| **Uso comercial** | Não encontrei restrição | Não verificado | Não encontrei proibição | Não verificado | Não verificado | Permitido | Permitido |
| **Código de servidor necessário** | **Nenhum**: SQL (tabelas, RLS, 3 funções, 1 hook) | **Nenhum**: security rules + *handler* de reset no app | **Tudo**: login, sessão, hash, reset, rate limit, autorização | Pouco, mas **Auth em beta** e reset por SDK "not fully supported" | Nenhum | **Tudo**: backend PHP/Node com login, reset, sessões e autorização | Instalar, atualizar e fazer backup de Postgres + GoTrue + PostgREST + Kong… (Supabase) ou de um binário pré-1.0 (PocketBase) |
| **Isolamento por usuário sem backend** | RLS + `grant` explícito | Rules por `request.auth.uid` | Não, vai no seu código | RLS com `auth.user_id()` | Permissões por documento | Não, vai no seu código | RLS (Supabase) ou rules (PocketBase), mas você opera o servidor |
| **E-mail de confirmação/reset grátis** | Embutido: 2/h, **só para o time**, então precisa SMTP (Gmail grátis, 500/dia) | **Embutido**: reset 150/dia, verificação 1.000/dia | Não; Email Service só no Paid | Compartilhado limitado, sem link; precisa SMTP | 1.000 mensagens/mês | Caixa da Hostinger: 100 a 3.000/dia conforme o plano de e-mail | SMTP da Hostinger ou externo |
| **Primeiro degrau pago** | Pro US$ 25/mês (≈ R$ 128) | Blaze pago por uso, com cartão (valores não levantados) | Workers Paid US$ 5/mês | Launch por uso, sem mínimo | Pro US$ 25/mês | Plano superior | KVM maior |
| **Portabilidade futura** | Postgres padrão, `pg_dump`, auto-hospedável | Proprietário (NoSQL do Google) | SQLite, mas auth própria | Postgres padrão | Auto-hospedável | MySQL + seu backend | Postgres/SQLite |

**Critério que pesa mais aqui: zero código de servidor, com isolamento garantido por regras declarativas.**
- A privacidade dos *dados financeiros* é garantida pela cifragem no navegador em **qualquer** opção.
- O que muda de uma opção para outra é **quanto código de autenticação o dono escreve e mantém**.
- Nesse tipo de app, cada linha desse código é uma porta para tomar a conta e **apagar** o cofre do usuário, ainda que sem conseguir lê-lo.
- **Em segundo lugar:** o provedor **não apagar** dados por inatividade. Isso elimina o Appwrite.
- **Em terceiro:** não exigir reescrita para crescer, ou seja, Postgres padrão.

**Supabase vs Firebase, os dois finalistas:**
- **O Firebase tem duas vantagens reais:** e-mail embutido sem configurar SMTP e nenhuma pausa conhecida.
- **Escolho o Supabase por quatro motivos:**
  1. **Controle otimista de versão** fica garantido *no banco*, por uma função SQL. O cliente não consegue burlar.
  2. O **hook de lista fechada** do beta existe no Free.
  3. **Postgres portável.** Dá para sair com `pg_dump` ou auto-hospedar.
  4. O README já prevê o Supabase (`README.md:142-146`).
- **O que aceito em troca:**
  - **A pausa:** o uso diário do dono evita; o cache local permite continuar usando; e há 1 ano para restaurar.
  - **Configurar o Gmail como SMTP.**
- **O Firebase fica como plano B.** A troca custaria um `firebaseVaultStore` e a paginação do blob acima de 1 MiB. Com gzip isso só acontece muito além de 3 anos de uso (pela estimativa acima).

### Tabela 3: como sincronizar

| Critério | **Blob único com versão** | Registro a registro |
|---|---|---|
| O que o servidor vê | 1 tamanho e 1 data de atualização por usuário | Quantos lançamentos, quando cada um mudou, tamanho de cada um (vaza metadados) |
| Código | 1 tabela, 1 função `save_vault`, fusão por `id` no cliente (~150 linhas + testes) | Tabelas ou coleção por entidade, migrações, log de mudanças, tombstones; perto do que o Actual faz com CRDT |
| Dois aparelhos editando | O segundo a salvar recebe "conflito", baixa a versão nova, funde as mudanças por `id` (3 vias) e salva de novo | Conflito por registro, mais fino |
| Custo de banda | ~0,3 MB por download completo (com gzip), só quando a versão remota mudou | Menor por mudança |
| Encaixe no código atual | Direto: `saveVaultData` já cifra o blob inteiro | Reescreve `FinanceContext` |

**Recomendo o blob único**, com **gzip antes de cifrar** e **fusão em 3 vias por `id`**. É o mais simples que não perde dados para 5 a 30 pessoas.

**Contas de capacidade (estimativa minha):**
- **Banco:** 30 usuários × (0,4 MB atual + 7 cópias diárias de histórico × 0,4 MB) ≈ **96 MB**, bem abaixo dos 500 MB.
- **Sem gzip**, o mesmo cálculo passaria de 800 MB. Por isso **o gzip é obrigatório**.
- **Banda (egress):** 30 × 0,4 MB × 4 downloads/dia × 30 dias ≈ **1,4 GB/mês**, abaixo dos 5 GB.

---

## Recomendação

**Stack:**
- **Front:** Cloudflare Workers com static assets, deploy pelo Workers Builds.
- **Banco e auth:** Supabase Free em São Paulo.
- **E-mail:** Gmail dedicado como SMTP.
- **Cofre:** blob único cifrado, com versão.
- **Opinião dos testadores:** formulário no app gravando em tabela.
- **Modo local:** o app continua 100% local quando as variáveis do Supabase não existem. Isso cobre desenvolvimento, Vitest e o E2E da CI.

**Por quê:**
- é R$ 0 sem cartão;
- não tem uma linha de backend;
- o servidor só recebe texto cifrado e embrulhos de chave;
- o isolamento é declarado em SQL e revisável no Git;
- crescer é trocar de plano, não de arquitetura: Supabase Pro (US$ 25) e Workers Paid (US$ 5) sem mudar código.

**Vale pagar a Hostinger para este projeto agora? Não.**

1. **Para o front,** ela custa R$ 527,52 adiantados (Premium, 48 meses) e renova a R$ 38,99/mês. Entrega menos que a Cloudflare grátis: cabeçalhos só por `.htaccess`, e build pelo GitHub só a partir do Unlimited.

2. **Para o banco,** a compartilhada oferece MySQL **sem autenticação gerenciada**. Seria preciso escrever e manter:
   - cadastro e login;
   - hash de senha e sessões;
   - tokens de redefinição por e-mail;
   - limite de tentativas;
   - CORS;
   - autorização por usuário em cada rota;
   - atualização do runtime.

   Num app financeiro, qualquer falha aí permite tomar contas e apagar cofres. No Supabase e no Firebase isso já existe, é mantido por equipes dedicadas e é configurado em regras.

3. **O VPS com Supabase auto-hospedado** coloca o dono como administrador de sistema. A própria Supabase lista atualização do sistema, backups, recuperação de desastre e monitoramento como responsabilidade de quem hospeda. Um PocketBase pré-1.0 tem o mesmo problema, com risco de mudanças incompatíveis.

4. **O que ela traz de verdade:** domínio incluso, caixas de e-mail com SMTP (100 a 3.000/dia) e servidores em São Paulo.
   - O domínio sai por **R$ 40/ano** no registro.br (resumo da busca, não confirmado).
   - O SMTP grátis sai do Gmail agora e, com domínio, do Resend (3.000/mês).
   - O Supabase já roda em São Paulo.

**Quando a Hostinger passaria a fazer sentido:**
- **(a)** Se o projeto precisar de um processo de servidor que não caiba em serverless e o dono tiver quem opere o servidor. Um VPS KVM 2 que renova a R$ 77,99 fica abaixo dos ~R$ 128 do Supabase Pro, **mas** só compensa com alguém cuidando de atualizações e backups (inferência).
- **(b)** Se o dono quiser domínio próprio com e-mail profissional num só lugar e com suporte em português, que não verifiquei.
  - Mesmo nesse caso, registro.br + Cloudflare + Resend faz o mesmo por menos.
  - A Hostinger entraria **só como provedor de e-mail/domínio**, não como host do app.

**Principal risco da recomendação:** redefinir a senha por e-mail sem ter o kit **devolve uma conta vazia de dados legíveis**.
- Para o usuário leigo, isso parece defeito.
- Quem tomar o e-mail de alguém consegue entrar na conta e sobrescrever o cofre remoto, embora não consiga lê-lo.

**Mitigações:**
- confirmação das palavras do kit no cadastro;
- texto explícito na tela de redefinição;
- aviso "Senha alterada" por e-mail;
- histórico de 7 cópias diárias no servidor, que o usuário não consegue apagar;
- o aparelho **nunca** substitui o cofre local por um remoto que a sessão atual não consegue abrir.

**Segundo risco:** a Cloudflare é o ponto de entrega do JavaScript. Quem controlar a conta Cloudflare ou o GitHub do dono pode publicar um app que rouba chaves.
- Isso vale para qualquer app web com E2E.
- **Mitigação:** verificação em duas etapas em GitHub, Cloudflare, Supabase e Gmail, mais o CSP restrito.

---

## Plano de implementação

### 1. Stack escolhida
| Peça | Escolha | Onde |
|---|---|---|
| Front | Cloudflare Workers com static assets (sem script de Worker) | `wrangler.jsonc` na raiz |
| Deploy | Workers Builds conectado ao GitHub; `npm run build` e depois `npx wrangler deploy` | Painel da Cloudflare |
| Banco e auth | Supabase Free, região `sa-east-1` | `supabase/migrations/0001_init.sql` (rodado à mão pelo dono) |
| Cliente | `@supabase/supabase-js`, **carregado por `import()` dinâmico** só no modo nuvem | `src/lib/cloud/` |
| E-mail | SMTP do Gmail dedicado (senha de app) | Painel do Supabase (nunca no repo) |
| Opinião | Tabela `feedback`, só inserção | App + SQL |
| Analytics | **Desligado no início**; opcional: Cloudflare Web Analytics | — |

### 2. Esquema de chaves

**Normalização:**
- `emailNorm = email.trim().toLowerCase()`
- `pwNorm = password.normalize('NFKC')` (só no modo nuvem; o modo local continua como está, para não quebrar contas existentes)

**Derivação (conta na nuvem, formato v2):**

```text
authSalt   = SHA-256( utf8("financaspro/auth-salt/v1|" + emailNorm) )     // 32 bytes, determinístico: login sem "pré-login"
master     = PBKDF2-HMAC-SHA256( pwNorm, authSalt, 600_000 ) → 256 bits    // OWASP 2023+
authSecret = HKDF-SHA256( master, salt = vazio, info = "financaspro/auth/v1" ) → 256 bits → base64url sem padding (43 chars)
pwWrapKey  = HKDF-SHA256( master, salt = vazio, info = "financaspro/wrap/v1" ) → 256 bits → chave AES-GCM (wrapKey/unwrapKey)

dataKey    = AES-GCM 256 aleatória (já existe: generateDataKeyAsync, crypto.ts:79)
kitKey     = PBKDF2-HMAC-SHA256( frase12palavras normalizada, kitSalt aleatório 32 bytes, 600_000 ) → 256 bits
```

| Item | Onde fica | Vai ao servidor? |
|---|---|---|
| Senha (`pwNorm`) | Só na memória, durante a derivação | **Nunca** |
| `master`, `pwWrapKey`, `kitKey` | Só na memória, descartados após o uso | **Nunca** |
| `dataKey` | Só na memória (`dataKeyRef`, `AuthContext.tsx:18`) | **Nunca** |
| Frase do kit (12 palavras) | Tela, papel impresso, cabeça do usuário | **Nunca**, nem em URL, log ou `localStorage` |
| `authSecret` | Enviado ao Supabase como "password" em `signUp`, `signInWithPassword` e `updateUser` | **Sim**. O Supabase guarda bcrypt dele. Não abre dados: HKDF com outro `info` não permite chegar ao `pwWrapKey` |
| `pw_wrap` = `dataKey` embrulhada por `pwWrapKey` (+ iv) | Tabela `vaults` + cache local | Sim (cifrado) |
| `kit_wrap` = `dataKey` embrulhada por `kitKey` (+ salt, iv, iterações, id curto, data) | Tabela `vaults` + cache local | Sim (cifrado) |
| `ciphertext` = AES-GCM(`dataKey`, gzip(JSON do cofre)) | Tabela `vaults` + cache local | Sim (cifrado) |
| E-mail | Supabase Auth | Sim (identificador) |

**Regras para o construtor:**
- **Não enviar** `verifier` (`crypto.ts:18`) ao servidor no formato v2. A falha de autenticação do AES-GCM já indica senha errada, e o login no Supabase já verificou a credencial.
- `authSecret` tem 43 caracteres, abaixo do limite de 72 do bcrypt. **Não** usar o valor em hexadecimal com prefixos longos.
- Senha mínima **12 caracteres**, com lista embutida de senhas comuns, checada no cliente.
  - O NIST pede 15 para senha como fator único (§3.1.1.2). Registrar como meta antes de abrir ao público.
  - O servidor não pode checar a força da senha, porque só vê `authSecret`.
- **Troca de e-mail fica bloqueada no beta.** O salt deriva do e-mail. Quando for liberar: derivar tudo de novo com o e-mail novo, chamar `updateUser({ email, password: novoAuthSecret })` e `set_password_wrap` no mesmo fluxo.
- **Kit renovado não gira a `dataKey` nesta etapa** (decisão de simplicidade):
  - o `kit_wrap` antigo é apagado do servidor, então o kit antigo deixa de abrir a conta;
  - backups exportados antes continuam abrindo com o kit da época;
  - girar a `dataKey` fica como melhoria futura (com um blob só, é barato).

### 3. Modelo de dados e regras (SQL completo)

Arquivo a criar pelo construtor: `supabase/migrations/0001_init.sql`. O **dono** roda no SQL Editor.

```sql
-- FinançasPro — esquema inicial (Supabase). Rodar UMA vez no SQL Editor.
-- Princípio: o servidor guarda só texto cifrado e embrulhos de chave. Nada aqui decifra dados.
-- Projetos criados após 30/05/2026 não expõem tabelas à Data API sem GRANT explícito.

------------------------------------------------------------
-- 1) Cofre: uma linha por usuário
------------------------------------------------------------
create table public.vaults (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  format        smallint    not null default 2,
  kdf           jsonb       not null,   -- {"alg":"PBKDF2-SHA256","iterations":600000,"salt":"email-v1"}
  pw_wrap       jsonb       not null,   -- {"iv":"b64","wrapped":"b64"}
  kit_wrap      jsonb,                  -- {"id":"a1b2c3","salt":"b64","iterations":600000,"iv":"b64","wrapped":"b64","createdAt":"ISO"}
  keys_version  integer     not null default 1,
  ciphertext    text,                   -- JSON EncryptedPayload de gzip(JSON do cofre)
  version       bigint      not null default 0,
  updated_at    timestamptz not null default now(),
  device_id     text,
  constraint vaults_kdf_obj      check (jsonb_typeof(kdf) = 'object'),
  constraint vaults_pw_wrap_obj  check (jsonb_typeof(pw_wrap) = 'object' and pw_wrap ? 'iv' and pw_wrap ? 'wrapped'),
  constraint vaults_kit_wrap_obj check (kit_wrap is null or (jsonb_typeof(kit_wrap) = 'object' and kit_wrap ? 'wrapped')),
  constraint vaults_cipher_size  check (ciphertext is null or octet_length(ciphertext) <= 5000000),
  constraint vaults_device_size  check (device_id is null or char_length(device_id) <= 64)
);

alter table public.vaults enable row level security;

revoke all on public.vaults from anon, authenticated;
grant select on public.vaults to authenticated;
-- INSERT só com colunas permitidas; version/keys_version/updated_at ficam no default.
grant insert (user_id, format, kdf, pw_wrap, kit_wrap, ciphertext, device_id) on public.vaults to authenticated;
-- Sem UPDATE/DELETE direto: alterações só pelas funções abaixo (garantem versão).

create policy "vaults_select_own" on public.vaults
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "vaults_insert_own" on public.vaults
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

------------------------------------------------------------
-- 2) Histórico: até 7 cópias, no máximo 1 a cada ~20h. Usuário só lê.
------------------------------------------------------------
create table public.vault_history (
  id          bigint generated always as identity primary key,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  version     bigint      not null,
  ciphertext  text        not null,
  created_at  timestamptz not null default now()
);
create index vault_history_user_created on public.vault_history (user_id, created_at desc);

alter table public.vault_history enable row level security;
revoke all on public.vault_history from anon, authenticated;
grant select on public.vault_history to authenticated;

create policy "vault_history_select_own" on public.vault_history
  for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.snapshot_vault()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.ciphertext is not null
     and old.ciphertext is distinct from new.ciphertext
     and not exists (
       select 1 from public.vault_history h
        where h.user_id = old.user_id
          and h.created_at > now() - interval '20 hours')
  then
    insert into public.vault_history (user_id, version, ciphertext)
    values (old.user_id, old.version, old.ciphertext);

    delete from public.vault_history h
     where h.user_id = old.user_id
       and h.id not in (
         select h2.id from public.vault_history h2
          where h2.user_id = old.user_id
          order by h2.created_at desc
          limit 7);
  end if;
  return new;
end;
$$;
revoke execute on function public.snapshot_vault() from public, anon, authenticated;

create trigger vaults_snapshot
  before update of ciphertext on public.vaults
  for each row execute function public.snapshot_vault();

------------------------------------------------------------
-- 3) Funções chamadas pelo app (supabase.rpc)
------------------------------------------------------------
-- Salva o cofre só se ninguém salvou antes (controle otimista).
-- Retorna a nova versão, ou NULL em conflito (ou cofre inexistente).
create or replace function public.save_vault(
  p_expected_version bigint,
  p_ciphertext text,
  p_device_id text default null
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_new bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  update public.vaults
     set ciphertext = p_ciphertext,
         version    = version + 1,
         updated_at = now(),
         device_id  = p_device_id
   where user_id = v_uid
     and version = p_expected_version
  returning version into v_new;

  return v_new;
end;
$$;

-- Troca o embrulho da senha (troca de senha, reset + kit, "lembrei a senha antiga").
create or replace function public.set_password_wrap(p_kdf jsonb, p_pw_wrap jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_keys integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  update public.vaults
     set kdf = p_kdf, pw_wrap = p_pw_wrap,
         keys_version = keys_version + 1, updated_at = now()
   where user_id = v_uid
  returning keys_version into v_keys;
  if v_keys is null then
    raise exception 'vault_not_found' using errcode = 'P0002';
  end if;
  return v_keys;
end;
$$;

-- Troca o embrulho do kit (gerar kit novo invalida o anterior).
create or replace function public.set_kit_wrap(p_kit_wrap jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_keys integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_kit_wrap is null or jsonb_typeof(p_kit_wrap) <> 'object' or not (p_kit_wrap ? 'wrapped') then
    raise exception 'invalid_kit_wrap' using errcode = '22023';
  end if;
  update public.vaults
     set kit_wrap = p_kit_wrap,
         keys_version = keys_version + 1, updated_at = now()
   where user_id = v_uid
  returning keys_version into v_keys;
  if v_keys is null then
    raise exception 'vault_not_found' using errcode = 'P0002';
  end if;
  return v_keys;
end;
$$;

revoke execute on function public.save_vault(bigint, text, text)      from public, anon;
revoke execute on function public.set_password_wrap(jsonb, jsonb)     from public, anon;
revoke execute on function public.set_kit_wrap(jsonb)                 from public, anon;
grant  execute on function public.save_vault(bigint, text, text)      to authenticated;
grant  execute on function public.set_password_wrap(jsonb, jsonb)     to authenticated;
grant  execute on function public.set_kit_wrap(jsonb)                 to authenticated;

------------------------------------------------------------
-- 4) Opinião dos testadores: só inserção; ninguém lê pelo app.
------------------------------------------------------------
create table public.feedback (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('bug', 'ideia', 'elogio', 'outro')),
  message      text not null check (char_length(message) between 1 and 2000),
  screen       text check (screen is null or char_length(screen) <= 40),
  app_version  text check (app_version is null or char_length(app_version) <= 40),
  created_at   timestamptz not null default now()
);

alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
grant insert (kind, message, screen, app_version) on public.feedback to authenticated;

create policy "feedback_insert_own" on public.feedback
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

------------------------------------------------------------
-- 5) Beta fechado: só e-mails da lista conseguem se cadastrar
------------------------------------------------------------
create table public.beta_allowlist (
  email     text primary key check (email = lower(email)),
  note      text,
  added_at  timestamptz not null default now()
);

alter table public.beta_allowlist enable row level security;
revoke all on public.beta_allowlist from anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant select on public.beta_allowlist to supabase_auth_admin;

create policy "beta_allowlist_auth_admin_read" on public.beta_allowlist
  for select to supabase_auth_admin
  using (true);

create or replace function public.hook_beta_allowlist(event jsonb)
returns jsonb
language plpgsql
as $$
begin
  if exists (
    select 1 from public.beta_allowlist
     where email = lower(event->'user'->>'email')
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'message', 'Cadastro fechado: este e-mail ainda não está na lista do beta.',
      'http_code', 403
    )
  );
end;
$$;

grant execute on function public.hook_beta_allowlist(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_beta_allowlist(jsonb) from authenticated, anon, public;

-- Depois de rodar: incluir os e-mails do beta
-- insert into public.beta_allowlist (email, note) values ('dono@gmail.com', 'dono');
```

**O que o construtor deve testar ou confirmar ao escrever o SQL:**
- O retorno `NULL` de `save_vault` chega ao `supabase.rpc` como `data: null` (conflito).
- O limite de tamanho do corpo da requisição na Data API: **não levantei**. Com gzip o blob fica bem abaixo de 1 MB.
- **Apagar conta no beta:** o dono apaga o usuário em Authentication → Users, e o `on delete cascade` remove cofre, histórico e opiniões.
  - Não há função de "apagar meus dados" no app nesta etapa. Quem sequestrar a sessão poderia chamá-la.
  - O pedido de exclusão vai pelo canal de contato (LGPD), e o dono cumpre à mão.

### 4. Fluxos

**Primeiro: o que recupera o quê (decisão 4)**

| O usuário tem | Volta a entrar na conta? | Volta a ler os dados? |
|---|---|---|
| E-mail + senha | Sim | Sim |
| Senha, mas perdeu o acesso ao e-mail | Sim (o login não precisa da caixa de entrada) | Sim |
| Acesso ao e-mail, sem senha, **com kit** | Sim (redefinição por e-mail) | **Sim** (o kit reembrulha a chave com a senha nova) |
| Acesso ao e-mail, sem senha, **sem kit** | Sim | **Não.** Só se lembrar a senha antiga, tiver um backup ou começar do zero |
| Sem e-mail e sem senha, com kit | Só com ajuda manual do dono (beta): ele troca o e-mail da conta no painel depois de confirmar a identidade pessoalmente, e o usuário faz a redefinição | Sim, com o kit |
| Nada | Não | Não |

**Cadastro**
1. Tela "Criar conta":
   - campos: nome de exibição, e-mail, senha (mínimo 12, lista de senhas comuns) e confirmação;
   - duas caixas de consentimento separadas: (a) termos do beta e política; (b) **transferência internacional em destaque** (art. 33, VIII).
2. O cliente deriva `authSecret` e chama `supabase.auth.signUp({ email, password: authSecret, options: { emailRedirectTo: SITE_URL, data: { display_name } } })`.
   - Se o e-mail não estiver na lista, o hook devolve 403. Mostrar a mensagem.
3. Tela "Confirme seu e-mail". **Nenhuma chave é gerada ainda**, porque não há sessão.
4. O usuário clica no link e o app abre com a sessão. Se a sessão existir mas faltar a derivação, pedir a senha: "Digite sua senha para configurar o cofre".
5. **Configurar cofre** (acontece sempre que houver login sem linha em `vaults`):
   1. gerar `dataKey`;
   2. gerar a frase de 12 palavras;
   3. mostrar o **kit** (tela imprimível);
   4. pedir 3 palavras em posições sorteadas;
   5. `insert` em `vaults` com `kdf`, `pw_wrap`, `kit_wrap` e `ciphertext` de um cofre vazio (ou do backup importado, ver "Migrar").
6. Gravar o cache local e entrar no painel.

**Login (aparelho já usado)**
1. E-mail + senha. Derivar `master`, `authSecret` e `pwWrapKey`.
2. **Se existir cache local para esse e-mail:**
   - tentar desembrulhar `pw_wrap` local e abrir o painel na hora, com os dados do cache;
   - em paralelo, `signInWithPassword({ email, password: authSecret })` (ou reaproveitar a sessão válida) e sincronizar.
3. **Sem cache:** fluxo de "Novo aparelho".
4. **Supabase fora do ar ou pausado:** continuar com o cache e mostrar o selo "sem sincronizar".

**Novo aparelho**
1. `signInWithPassword`, depois `select * from vaults` (a RLS devolve só a linha do usuário).
2. Desembrulhar `pw_wrap` com `pwWrapKey`.
   - **Se falhar, a senha foi redefinida por e-mail:** ir para "Abrir dados com o kit".
3. Decifrar `ciphertext`, descomprimir e carregar o `FinanceContext`.
4. Gravar o cache local: `{ email, userId, kdf, pw_wrap, kit_wrap, keys_version, version, ciphertext, base_ciphertext = ciphertext, dirty: false }`.

**Sincronização**
- **Quando puxar (pull):** ao desbloquear; ao voltar o foco se a última verificação tiver mais de 60 s; no evento `online`.
  - Primeiro buscar só `version, keys_version, updated_at`. Baixar `ciphertext` só se `version` mudou.
- **Quando empurrar (push):** 3 s depois da última mudança, com debounce separado do salvamento local de 300 ms; em `visibilitychange` para oculto; ao sair.
  - Chamada: `rpc('save_vault', { p_expected_version: cache.version, p_ciphertext, p_device_id })`.
  - Resposta com número: atualizar `version`, fazer `base_ciphertext = ciphertext` e `dirty = false`.
  - Resposta `null` (**conflito**):
    1. baixar o remoto (R) e decifrar;
    2. decifrar a base (B) e pegar o local (L);
    3. **fundir em 3 vias** por `id` em cada coleção (`transactions`, `cards`, `card_purchases`, `rules`);
    4. para `invoices`, fundir só o campo `paid` por `id`;
    5. salvar com `expected = R.version`;
    6. tentar no máximo 3 vezes.
- **Regras da fusão**, com igualdade por JSON estável:
  - não estava na base: se só um lado tem, entra; se os dois têm e são diferentes, fica o **local**;
  - apagado de um lado e intacto do outro: apaga;
  - apagado de um lado e **editado** do outro: fica a edição;
  - editado dos dois lados: fica o **local**;
  - contar os conflitos e mostrar "Juntamos alterações de outro aparelho (N conflitos; mantivemos as deste aparelho)".
- **Regra de segurança:** **nunca** substituir `pw_wrap`, `kit_wrap` ou o cofre do cache por versões remotas que a `dataKey` da sessão não consegue decifrar. Nesse caso, mostrar "Os dados na nuvem mudaram de um jeito que este aparelho não consegue abrir. Seus dados locais foram preservados" e não sobrescrever nada.
- **Gzip:** `CompressionStream('gzip')` antes de `encryptData` e `DecompressionStream` depois de `decryptData`. Marcar no `EncryptedPayload` um campo `z: 'gzip'` para compatibilidade.

**Esqueci a senha**
1. Login → "Esqueci a senha" → e-mail → `resetPasswordForEmail(email, { redirectTo: SITE_URL })`.
   - Mostrar sempre a mesma mensagem, para não revelar se o e-mail existe.
2. O link abre o app. O cliente, com `flowType: 'pkce'` e `detectSessionInUrl: true` (confirmar na referência do `createClient`), recebe o evento `PASSWORD_RECOVERY`.
3. Tela "Nova senha", com o texto fixo:
   > "Isto devolve o acesso à sua conta. Para voltar a ver seus dados você vai precisar do **kit de recuperação**. A FinançasPro não consegue abrir seus dados sem ele."
4. Derivar `newAuthSecret` e `newPwWrapKey`, e chamar `updateUser({ password: newAuthSecret })`. **Não** mexer em `pw_wrap` ainda: ele continua embrulhado com a senha antiga.
5. Ir direto para "Abrir dados com o kit". Se o usuário fechar a página aqui, o próximo login detecta a falha ao desembrulhar `pw_wrap` e volta para esse passo.

**Recuperar com o kit** (tela "Abrir dados com o kit", sempre com sessão válida)
1. O usuário digita as 12 palavras: normalizar, derivar `kitKey` com o salt e as iterações de `kit_wrap`, desembrulhar e obter a `dataKey`.
2. Embrulhar a `dataKey` com `pwWrapKey` (da senha atual) e chamar `set_password_wrap(kdf, pw_wrap)`.
3. Decifrar o cofre e seguir normalmente. Atualizar o cache.
4. Oferecer "Gerar kit novo agora", recomendado porque o kit acabou de ser digitado.

**Alternativas na mesma tela, sem kit:**
- **"Lembrei a senha antiga":** derivar `master` antigo, desembrulhar `pw_wrap`, reembrulhar com a senha atual e chamar `set_password_wrap`.
- **"Restaurar de um backup":** fluxo de backup (abaixo).
- **"Começar do zero":**
  1. confirmação dupla com o texto "Os dados antigos continuarão cifrados e ninguém conseguirá abri-los";
  2. gerar nova `dataKey` e novo kit;
  3. `set_password_wrap` + `set_kit_wrap` + `save_vault` com cofre vazio;
  4. o histórico ainda guarda até 7 cópias antigas por alguns dias, igualmente ilegíveis.

**Gerar kit novo** (Configurações, com sessão desbloqueada)
1. Gerar a frase e mostrar a página imprimível:
   - usar `window.print()` com CSS de impressão;
   - conteúdo: e-mail, data, 12 palavras numeradas, **id curto do kit** (6 primeiros caracteres hex de SHA-256 do `wrapped`), instruções;
   - nada em URL.
2. Pedir 3 palavras sorteadas.
3. Criar `kit_wrap` e chamar `set_kit_wrap`. Atualizar o cache.
4. Avisar: "O kit anterior (id `xxxxxx`) não abre mais a sua conta. Backups exportados antes desta data continuam abrindo com o kit antigo."
5. Em Configurações, mostrar "Kit atual: id `xxxxxx`, criado em dd/mm/aaaa" e um lembrete se o kit tiver mais de 12 meses (inferência de boa prática).

**Backup que também abre com o kit (formato v2)**
- Arquivo `.financas.enc`:

```json
{ "format": "financaspro-backup", "v": 2, "createdAt": "ISO",
  "wraps": { "kit": { kit_wrap da época }, "password": { kdf + pw_wrap da época, opcional } },
  "payload": { EncryptedPayload de gzip(JSON) cifrado com a dataKey } }
```

- Abrir: com o kit ou com a senha da conta da época, obter a `dataKey` e decifrar.
- Manter a leitura do formato v1 atual (`backup.ts:250-261`, senha própria) para arquivos antigos.
- A validação com Zod continua a mesma (`backup.ts:12-19`).

**Migrar dados locais para a nuvem**
- **Caminho principal, para qualquer origem**, que é o caso do dono (`localhost:5173` para o site publicado):
  1. no app local atual: Configurações → **Exportar backup** (senha do backup);
  2. no app publicado: criar a conta; em "Configurar cofre", escolher **"Começar com um backup"**, informar o arquivo e a senha do backup;
  3. o cofre inicial vai com os dados importados.
- **Caminho automático, só na mesma origem.** Serve quando o dono roda `npm run dev` com `.env.local` apontando para o Supabase e já tem contas locais em `localhost:5173`:
  1. se `financaspro_accounts` existir, mostrar "Levar a conta local *Fulano* para a nuvem";
  2. pedir a senha local e chamar `unlockVault` para obter a `dataKey`;
  3. `loadVaultData` e `decryptData`;
  4. no cadastro ou login na nuvem, **reutilizar a mesma `dataKey`**, embrulhando com a senha nova e o kit novo, e subir o `ciphertext` recifrado com gzip;
  5. **baixar de volta e comparar** a quantidade de registros;
  6. só então marcar a conta local como "migrada" (sem apagar). Apagar é um botão separado, com confirmação.
- **Nunca apagar** dados locais ao trocar de modo.

### 5. Variáveis de ambiente e CSP

**`.env.example`** (novo, versionado):
```dotenv
# Deixe vazio para rodar 100% local (dev, testes, CI).
# Estes valores são PÚBLICOS: vão para o JavaScript do navegador.
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
# Opcional: força modo local mesmo com as variáveis acima preenchidas.
VITE_APP_MODE=
# Opcional: Cloudflare Web Analytics (token público do beacon)
VITE_CF_BEACON_TOKEN=
```

| Onde fica | O que |
|---|---|
| `.env.local` (máquina do dono, fora do Git pelo `.gitignore`) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| Cloudflare → Worker → Settings → Build → Variables | As mesmas duas `VITE_*` |
| GitHub Actions (CI) | **Nada.** A CI testa o modo local |
| **Nunca no front, no repo nem na CI** | `sb_secret_...` e a antiga `service_role`; senha do Postgres; senha de app do Gmail (fica só no painel do Supabase); JWT secret; tokens de API da Cloudflare; e qualquer frase de kit, senha ou `authSecret` em log |

**Chave secreta vazada.** A CI deve falhar se o build contiver uma chave secreta. Passo novo em `ci.yml`, depois do build:
```yaml
      - name: Guard against secrets in bundle
        run: "! grep -rE 'sb_secret_|service_role' dist"
```

**CSP.** Gerar o `connect-src` no build com um plugin pequeno no `vite.config.ts` (`transformIndexHtml`), que também roda no `dev`:
- `index.html:8` passa a ter `connect-src __CONNECT_SRC__;`.
- O plugin troca o marcador por `'self'`, somado à **origem** de `VITE_SUPABASE_URL` quando ela existir (ex.: `https://abcd1234.supabase.co`).
- Não usar o `%VITE_...%` nativo do Vite: variável ausente fica como texto literal, conforme a [documentação do Vite](https://vite.dev/guide/env-and-mode).
- Não é preciso `wss:`, porque o app não usa Realtime.
- Se ligar o Web Analytics: `script-src 'self' https://static.cloudflareinsights.com` e `connect-src ... https://cloudflareinsights.com`.
- **Recomendado (privacidade):** servir as fontes Manrope e Space Grotesk a partir de `public/fonts/` e remover `fonts.googleapis.com` e `fonts.gstatic.com` do CSP e do `index.html:11`.

**`public/_headers`** (vai para `dist/_headers`):
```text
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: frame-ancestors 'none'
  Strict-Transport-Security: max-age=31536000
```

O CSP completo continua no `<meta>`, porque precisa da URL do Supabase no build. O cabeçalho HTTP acrescenta `frame-ancestors`, que o `<meta>` ignora. O navegador aplica os dois.

**`wrangler.jsonc`** (novo, na raiz):
```jsonc
{
  "name": "financaspro",
  "compatibility_date": "2026-09-01",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  }
}
```

Sem `main`, sem script: é isso que faz o `_headers` valer. Se o build reclamar da falta de `wrangler`, adicionar `wrangler` como devDependency.

### 6. Modo só local (dev, Vitest, CI)
- **`src/lib/cloud/config.ts`:**
  ```ts
  export const cloudEnabled =
    import.meta.env.VITE_APP_MODE !== 'local' &&
    Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
  ```
- **`AuthContext`** escolhe o provedor: `cloudEnabled ? await import('../lib/cloud/supabaseAuthProvider') : createLocalAuthProvider()` (hoje fixo em `AuthContext.tsx:15`).
- **Separar "quem guarda o cofre" de "quem autentica":**
  - nova interface `VaultStore { load(): Promise<VaultData>; save(data): Promise<void>; status$ }`;
  - implementações `LocalVaultStore` (envolve `secureStorage.ts`) e `CloudVaultStore` (cache + sync);
  - o `FinanceContext` recebe o store por prop em vez de chamar `loadVaultData`/`saveVaultData` direto (`FinanceContext.tsx:166`, `:183`).
- **Evoluir `AuthProvider`** para uma versão assíncrona. O provedor local implementa com os mesmos dados de hoje:
  ```ts
  interface AuthProviderV2 {
    mode: 'local' | 'cloud';
    listLocalAccounts(): Promise<UserAccount[]>;           // cloud: contas em cache neste aparelho
    register(input: { displayName: string; email?: string; password: string }): Promise<RegisterResult>;
    signIn(input: { userId?: string; email?: string; password: string }): Promise<AuthSession | NeedsKit | NeedsVaultSetup>;
    signOut(): Promise<void>;
    changePassword(oldPassword: string, newPassword: string): Promise<void>;
    requestPasswordReset?(email: string): Promise<void>;     // só cloud
    completePasswordReset?(newPassword: string): Promise<NeedsKit>;
    unlockWithKit(phrase: string): Promise<AuthSession>;
    renewKit(): Promise<{ phrase: string; kitId: string }>;
    deleteLocalAccount(userId: string, password: string): Promise<void>;
  }
  ```
- **Vitest:** sem `.env`, tudo local, e os testes atuais continuam valendo. Testes novos:
  - vetores fixos de `deriveAccountKeys` (e-mail + senha conhecidos → `authSecret` esperado; gerar uma vez e fixar no teste);
  - `authSecret` e `pwWrapKey` sempre diferentes;
  - `mergeVault` 3 vias (tabela de casos acima);
  - gzip ida e volta;
  - backup v2 abrindo com kit e com senha;
  - `CloudVaultStore` com cliente Supabase **simulado** (conflito → fusão → segunda tentativa).
- **E2E na CI:** continua em modo local. Atualizar `e2e/smoke.spec.ts:18-21` quando o cadastro ganhar a confirmação de palavras. **Não** apontar a CI para o Supabase real.
- **Opcional, depois:** E2E de nuvem com `supabase start` (Docker) só na máquina do dono. Não levantei os requisitos.

### 7. Opinião dos testadores
- **Recomendado: botão "Dar opinião" no menu** (só no modo nuvem), com modal:
  - tipo (bug/ideia/elogio/outro), mensagem de até 2.000 caracteres, tela atual e versão do app (`package.json` `version` via `define`);
  - aviso fixo: **"Não cole valores, nomes de estabelecimentos nem dados bancários."**;
  - grava em `feedback` com `insert` (retorno mínimo, sem `select`).
  - O dono lê em Table Editor → `feedback`.
- **Por que não GitHub Issues:** o repositório é público, então as mensagens dos amigos ficariam públicas e exigiriam conta no GitHub.
- **Tally:** grátis e com dados na UE. Serve para uma **pesquisa anônima** pontual ("o que achou depois de 2 semanas"). Link externo, aberto em nova aba, sem incorporar no app (CSP).
- **Analytics:** **não ligar no começo.** Com 5 a 30 pessoas conhecidas, conversar rende mais que números.
  - Se ligar depois: Cloudflare Web Analytics, que não usa cookies nem `localStorage` e só mede páginas e desempenho.
  - O app não tem rotas nem query strings com dados, então nada financeiro sai.
  - **Proibido:** qualquer evento com valor, descrição, categoria ou nome de banco.

### 8. LGPD mínima para o beta fechado
Inferência minha, **não é parecer jurídico**; baseada nos artigos acima e no relatório de 2026-09-13.

**Enquadramento:**
- Ao guardar e-mails de outras pessoas num servidor, o dono passa a ser **controlador**. A exceção "fins exclusivamente particulares" (art. 4º, I) cobre quem usa o app para si, não quem oferece a conta a terceiros.

**Dados tratados:**
- e-mail, nome de exibição, datas de login e IP (logs do Supabase e da Cloudflare);
- texto das opiniões;
- **dados financeiros só cifrados**, que o controlador não consegue ler.

**O que publicar dentro do app** (página "Privacidade e termos do beta", sem login), cobrindo o art. 9º:
1. **Finalidade:** permitir login e sincronizar o cofre cifrado entre aparelhos; receber opiniões.
2. **Forma e duração:** até o fim do beta ou até pedido de exclusão; aviso de 30 dias antes de encerrar.
3. **Controlador:** nome do dono e **e-mail de contato**, que é o canal exigido pela Resolução 2/2022, art. 11.
4. **Operadores e onde ficam os dados:**
   - Supabase: banco em São Paulo; empresa nos EUA; DPA com cláusulas da UE, sem menção à LGPD.
   - Cloudflare: entrega do site, rede global.
   - Google/Gmail: envio de e-mails.
5. **O que ninguém consegue ver:** senha, kit e conteúdo financeiro.
6. **Direitos do art. 18** e como exercer (e-mail). Exclusão feita pelo dono no painel em até 15 dias (prazo sugerido por mim).
7. **Incidentes:** comunicação à ANPD e aos titulares se houver risco relevante (Resolução 15/2024, 3 dias úteis; ver relatório anterior).
8. **Riscos do beta:** pode perder dados, pode sair do ar, e sem kit não há recuperação de dados.

**Consentimento no cadastro:**
- Base legal da conta: execução de contrato (art. 7º, V).
- Para a **transferência internacional**, usar uma caixa **separada e em destaque**: "Entendo que meus dados de conta são processados por empresas fora do Brasil (Supabase, Cloudflare, Google)". Isso cobre o art. 33, VIII, que é o mecanismo mais simples para um beta com amigos.
- Guardar a data e a versão do texto aceito em `user_metadata` (só registro; não usar para autorização).

**Minimização:**
- não pedir nome real, CPF nem telefone;
- não gravar user-agent;
- logs do Supabase Free duram 1 dia.

### 9. Passo a passo que o DONO faz manualmente

**Antes de tudo**
1. No app local atual (`localhost:5173`): Configurações → **Exportar backup**. Guardar o arquivo e a senha do backup.
2. Ligar a **verificação em duas etapas** no GitHub (se ainda não estiver).

**Supabase** (sem cartão)
3. Criar conta em supabase.com (pode entrar com o GitHub).
4. **New project:**
   - nome `financaspro`;
   - região **South America (São Paulo)**;
   - gerar uma **senha do banco** forte e guardá-la num gerenciador de senhas (nunca no repositório);
   - se aparecer a opção "Automatically expose new tables", **deixar desmarcada**.
5. Ligar a verificação em duas etapas na conta Supabase (Account → Security).
6. **SQL Editor:** colar o conteúdo de `supabase/migrations/0001_init.sql` (o construtor cria) e clicar **Run**. Depois rodar:
   ```sql
   insert into public.beta_allowlist (email, note) values ('SEU-EMAIL@gmail.com', 'dono');
   ```
7. **Authentication → Hooks:** ativar **Before User Created** → tipo Postgres → função `public.hook_beta_allowlist`.
8. **Authentication → Sign In / Providers → Email:**
   - Email ligado;
   - **Confirm email** ligado;
   - **Secure email change** ligado;
   - senha mínima 8, **sem exigência de caracteres especiais** (o app manda um segredo derivado de 43 caracteres; exigir símbolo quebraria o cadastro);
   - deixar desligado "exigir senha atual ao trocar senha"; se estiver ligado, avisar o construtor para testar o reset.
9. **Gmail dedicado** (ex.: `financaspro.beta@gmail.com`):
   1. criar a conta;
   2. ligar a verificação em duas etapas;
   3. em myaccount.google.com → Senhas de app, gerar uma senha de app.
10. **Authentication → Emails → SMTP Settings:** ligar custom SMTP.
    - Host `smtp.gmail.com`, porta `587`;
    - usuário = o Gmail dedicado; senha = a senha de app;
    - remetente = o mesmo Gmail; nome "FinançasPro (beta)".
    - Em Rate Limits, manter 30 e-mails/h.
11. **Authentication → Emails → Templates:** traduzir "Confirm signup" e "Reset password" para português. No reset, escrever: "Este link devolve o acesso à conta. Seus dados só voltam com o kit de recuperação."
    - Se aparecer a opção de **notificações de segurança** ("Password changed"), ligar.
12. **Settings → API Keys:** copiar **Project URL** e a **Publishable key** (`sb_publishable_...`). **Não copiar a secret key para lugar nenhum.**

**Cloudflare** (sem cartão)
13. Criar conta em dash.cloudflare.com e ligar a verificação em duas etapas.
14. **Workers & Pages → Create → Import a repository:**
    - autorizar o app da Cloudflare **só** no repositório `financas-pro`;
    - nome do Worker **`financaspro`** (igual ao `wrangler.jsonc`);
    - Build command `npm run build`; Deploy command `npx wrangler deploy`;
    - branch de produção `main`.
15. **Settings → Build → Variables:** adicionar `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com os valores do passo 12. Disparar um novo build.
16. Anotar a URL gerada (ex.: `https://financaspro.<sua-conta>.workers.dev`).

**Ligar as duas pontas**
17. **Supabase → Authentication → URL Configuration:**
    - Site URL = a URL do passo 16;
    - Redirect URLs: a mesma URL, `http://localhost:5173` e `http://localhost:4173`.

**Máquina do dono** (para desenvolver em modo nuvem)
18. Criar `C:\Projects\financas-pro\.env.local` com as duas variáveis. **Não commitar**; o `.gitignore` já bloqueia.

**Teste de aceitação** (o dono faz, em janela anônima)
19. Criar conta → confirmar e-mail → imprimir o kit → confirmar palavras → **importar o backup** do passo 1 → conferir o painel.
20. Abrir em outro navegador ou no celular → login → ver os mesmos dados.
21. Editar no celular e no PC ao mesmo tempo → conferir que nada sumiu.
22. "Esqueci a senha" → link → nova senha → digitar o kit → dados de volta.
23. "Gerar kit novo" → tentar o kit antigo → deve falhar.
24. Mandar uma opinião → conferir em Table Editor → `feedback`.

**Convidar amigos**
25. Para cada amigo: `insert into public.beta_allowlist (email) values ('amigo@...');` e mandar o link com um aviso curto sobre o kit.

**Rotina**
26. Se chegar e-mail do Supabase avisando pausa: abrir o painel ou usar o app. Se pausar mesmo: **Resume project** (há até 1 ano para isso).
27. Pedido de exclusão: Authentication → Users → apagar o usuário (cofre, histórico e opiniões somem em cascata).

### 10. Ordem sugerida de commits/entregas
Cada item é um PR pequeno, com testes, e a CI verde em modo local.

1. **`crypto: derivação v2 e gzip`**
   - `deriveAccountKeys(email, password)` (PBKDF2 600k + HKDF auth/wrap), `wrapKeyWith`/`unwrapKeyWith`, `compress`/`decompress`, `EncryptedPayload.z`;
   - testes com vetores fixos;
   - nenhuma tela muda.
2. **`kit: kit de recuperação renovável (modo local)`**
   - gerar kit novo em Configurações (invalida o anterior), página imprimível, id curto, confirmação de 3 palavras no cadastro;
   - atualizar `e2e/smoke.spec.ts`.
3. **`backup: formato v2 que abre com o kit`**, lendo também o v1.
4. **`refactor: VaultStore + AuthProviderV2 + cloudEnabled`**
   - só abstrações, provedor local por baixo, comportamento idêntico;
   - E2E sem mudanças.
5. **`supabase: migração SQL + docs/deploy/supabase.md`**
   - o arquivo `0001_init.sql` acima e o passo a passo do dono (seção 9) em markdown.
6. **`cloud: supabaseAuthProvider + CloudVaultStore`**
   - `import()` dinâmico do `@supabase/supabase-js`;
   - telas de login e cadastro por e-mail (só no modo nuvem), "Configurar cofre", cache local, offline;
   - testes com cliente simulado.
7. **`sync: controle de versão e fusão em 3 vias`**
   - `save_vault`, gatilhos de pull/push, `mergeVault` com testes de tabela, aviso de conflitos, regra "nunca sobrescrever com o que não abre".
8. **`auth: esqueci a senha + abrir dados com o kit`**
   - `PASSWORD_RECOVERY`, tela de nova senha com o texto fixo, "lembrei a senha antiga", "começar do zero".
9. **`migração: começar com backup + levar conta local (mesma origem)`**
10. **`deploy: wrangler.jsonc, _headers, plugin de CSP, .env.example, guarda de segredos na CI, README`**
11. **`beta: opinião no app + página de privacidade e termos + consentimentos`**
12. **Opcionais:**
    - fontes auto-hospedadas;
    - Cloudflare Web Analytics;
    - não duplicar `purchases` nas faturas pagas (guardar só `{id, paid}`);
    - subir a senha mínima para 15.

Os passos 1 a 4 podem ir para produção **antes** de existir Supabase: melhoram o app local e preparam o terreno.

---

## Confiança e lacunas

**Alta** para:
- o que está no código (li os arquivos e cito as linhas);
- os limites e regras de Supabase, Firebase, Cloudflare, Vercel, GitHub Pages, Appwrite e Neon (páginas oficiais lidas hoje);
- a exigência de `grant` explícito no Supabase;
- os modelos de Bitwarden e 1Password;
- os preços da Hostinger (página oficial em R$, hoje).

**Média** para:
- **Gmail pessoal como SMTP do Supabase:** o guia oficial é para Workspace; para Gmail pessoal há só relatos. Se falhar, o plano B sem custo é o Brevo (300/dia, remetente trocado por `@brevosend.com`). Com domínio (≈ R$ 40/ano), o Resend.
- **SQL completo:** segue a documentação, mas **não foi executado**. O construtor deve rodar num projeto de teste e ajustar erros de sintaxe ou permissão, principalmente o `grant` para `supabase_auth_admin` e o retorno `null` de `save_vault` no `supabase.rpc`.
- **Tamanho do blob e contas de banda e armazenamento:** medição sintética com premissas minhas.
- **Enquadramento na LGPD:** inferência, não parecer jurídico.

**Baixa ou sem resposta:**
- Cloudflare: se o plano grátis exige cartão e se permite uso comercial (fórum deu 403; só fonte secundária).
- Supabase: se o Free exige cartão (a documentação não diz).
- Vercel e Netlify: cartão, e o que a Netlify faz quando os créditos acabam.
- Firebase: política de projetos Spark inativos (não encontrei).
- Hostinger: se o plano Premium tem Git/SSH; se o Brasil é a região padrão na contratação; suporte em português.
- Parâmetros `flowType`/`detectSessionInUrl` do `createClient` (não li a referência).
- O limite de corpo de requisição da Data API do Supabase.
- Se o Workers Builds exige `wrangler` como dependência do projeto.
- Preço do domínio `.br` (só resumo da busca).

**O que resolveria:**
- Criar um projeto Supabase de teste e rodar o SQL.
- Fazer um deploy de teste no Workers Builds.
- Testar o Gmail como SMTP enviando para um endereço de fora.
- Ler os termos da Cloudflare (Self-Serve Subscription Agreement) sobre uso comercial.
- Perguntar ao suporte da Hostinger sobre Git/SSH no Premium e a região padrão, se o dono ainda considerar contratar.

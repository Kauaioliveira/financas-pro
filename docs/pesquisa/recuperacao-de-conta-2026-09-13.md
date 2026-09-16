# FinançasPro: como recuperar o acesso sem quebrar a privacidade

Pesquisa feita em 2026-09-13. A busca web **funcionou** nesta sessão. Algumas páginas oficiais bloquearam a leitura automática (Planalto deu ECONNRESET; Standard Notes, Telesíntese e ddi-ddd deram 403; a tabela de preços do WhatsApp é um widget interativo sem texto). Nesses casos uso fontes secundárias e aviso. Todos os dados externos abaixo foram vistos em **2026-09-13**.

Base local: `src/lib/crypto/*`, `src/lib/auth/*`, `src/components/auth/*`, `src/components/SettingsModal.tsx`, `src/utils/backup.ts`, `index.html`, `README.md` e o relatório anterior `docs/pesquisa/mvp-para-produto-2026-09-10.md`. Esse relatório já concluiu que a privacidade é um dos dois diferenciais reais do produto. Aqui eu parto disso e não repito.

---

## Resposta curta

"Recuperar por telefone ou e-mail" só preserva a privacidade se o código que chega por WhatsApp, SMS ou e-mail **destravar apenas metade da chave**. A outra metade precisa continuar no aparelho do usuário.

Guardar a chave inteira num servidor é o que Proton, Bitwarden, 1Password e Standard Notes **se recusam a fazer**. Isso transforma "só você acessa" em "você e quem controla o servidor ou o seu chip".

Recomendo três passos:
1. **Agora, sem servidor:** trocar a frase mostrada uma única vez por um **kit de recuperação** que pode ser gerado de novo em Configurações, e oferecer **desbloqueio por digital ou rosto (passkey com PRF)** como alternativa à senha.
2. **Só se o dono quiser mesmo o telefone:** acrescentar, como opção ligada pelo usuário, uma **recuperação pelo WhatsApp que funciona só neste aparelho**, com chave dividida entre o servidor e o aparelho e prazo de espera.
3. **Nunca:** custódia da chave inteira no servidor.

Um problema vem antes de tudo isso: nenhum método recupera dados de um navegador limpo ou de um aparelho perdido, porque os dados só existem naquele `localStorage`. Nesse caso só um backup (ou uma futura sincronização) salva o usuário.

---

## Premissas que precisam ser corrigidas antes

1. **Existem duas perdas diferentes, e o pedido trata as duas como uma só.**
   - **Perda A:** esqueci a senha, mas o aparelho e o navegador estão intactos.
   - **Perda B:** perdi o aparelho, limpei o navegador ou troquei de computador.

   Hoje o cofre (`financaspro_accounts`) e os dados cifrados vivem só no `localStorage` (`src/lib/auth/localAuthProvider.ts:10`, `:29-42`). Na perda B não sobra nada para decifrar. Nem senha, nem frase, nem e-mail, nem SMS resolvem. O único remédio é o backup `.financas.enc` (`src/utils/backup.ts:25-45`). **Toda opção abaixo, exceto backup e sincronização, resolve só a perda A.**

2. **A Fase 2 do README promete algo que não entrega sozinha.** O roadmap prevê "`supabaseAuthProvider` para login por e-mail + reset de senha" junto com um "blob cifrado" que o servidor nunca vê (`README.md:142-145`). A Proton, que usa exatamente esse modelo, documenta o limite: "SMS and email recovery only allow password reset. So if you use one of these options, you may need an additional data recovery method to regain access to your data" ([Proton](https://proton.me/support/recover-encrypted-messages-files)). Ou seja, o reset por e-mail devolve **a conta**, não **os dados**, a menos que o servidor guarde a chave. O próprio README já reconhece isso na linha 117: "Não recupera dados automaticamente por e-mail, porque isso quebraria o E2E".

---

## O que foi apurado

### No código (verificado em 2026-09-13)
- **O CSP bloqueia qualquer chamada externa:** `connect-src 'self'` (`index.html:8`). Qualquer opção com servidor, WhatsApp, SMS ou e-mail exige mudar o CSP e publicar uma API.
- **Como a frase funciona:** ela é derivada com PBKDF2 (310.000 iterações, `src/lib/crypto/constants.ts:1`) e embrulha a mesma `dataKey` que a senha (`src/lib/crypto/crypto.ts:195-210`). A troca de senha preserva esse embrulho (`crypto.ts:184-188`). Recuperar pela frase gera uma senha nova e embrulha a chave de novo (`crypto.ts:212-263`).
- **Entropia da frase:** 12 palavras de uma lista de 128 (`src/lib/crypto/wordlist.ts:3-20`, `:22-27`). O índice é `byte % 128`; como 256 é múltiplo de 128, a distribuição é uniforme. Isso dá **84 bits** (cálculo meu). O NIST pede pelo menos 64 bits para um código de recuperação salvo (seção NIST abaixo), então **a força está adequada**. O problema é de experiência de uso, não de criptografia.
- **A frase aparece uma única vez**, no cadastro (`src/components/auth/RegisterScreen.tsx:46-53`), com o texto "única maneira de recuperar seus dados" (`:97`). Não existe função para gerar outra frase nem para vê-la de novo: nenhum componente além de `RegisterScreen` e `RecoveryScreen` usa `addRecoveryWrap` ou `recoverWithPhrase`. Se a frase vazar, o acesso fica aberto para sempre, porque não há como girá-la.
- **O backup usa uma senha própria**, com mínimo de 4 caracteres (`src/components/SettingsModal.tsx:122`; `crypto.ts:301-330`). Não abre com a frase nem com a `dataKey`. Quem esquece a senha da conta tende a esquecer também essa, e aí o backup também fica inútil.
- **O campo `email?` existe no tipo `UserAccount`** (`src/lib/auth/types.ts:6`), mas não é usado em lugar nenhum.
- **Achado lateral, que afeta "só você acessa":** o bloqueio após 5 tentativas vive num `Map` em memória (`localAuthProvider.ts:27`) e some ao recarregar a página. A senha mínima tem 6 caracteres (`:73`). Quem copiar o `localStorage` pode testar senhas offline, sem limite. Qualquer opção de recuperação "neste aparelho" herda esse ponto fraco.

### NIST SP 800-63B-4 (julho de 2025, versão final; lido no PDF oficial)
- **SMS e voz são autenticadores "restritos".** "At the time of publication of these guidelines, there is one restricted authenticator: the use of the PSTN for out-of-band authentication" (§3.2.9). Quem usar precisa "Offer subscribers at least one alternative authenticator that is not restricted" e dar "meaningful notice regarding the restricted authenticator's security risks" (§3.2.9). A página HTML cita troca de aparelho, troca de SIM e portabilidade como indicadores de risco a considerar antes de usar a rede telefônica (§3.1.3.3). Fontes: [PDF](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63B-4.pdf) e [HTML](https://pages.nist.gov/800-63-4/sp800-63b.html).
- **E-mail não serve para autenticar, mas serve para recuperar.** "Email SHALL NOT be used for out-of-band authentication", porém "Confirmation codes that are sent to validate email addresses or are issued as recovery codes (see Sec. 4.2.1.2) are not authentication processes and not affected by the above prohibition" (§3.1.3.1).
- **Métodos de recuperação reconhecidos:** "Saved recovery codes · Issued recovery codes · Use of recovery contacts · Repeated identity proofing" (§4.2.1).
  - Código salvo: "at least 64 bits"; depois de usado, "SHALL issue a new saved recovery code"; o usuário "MAY request a replacement recovery code" (§4.2.1.1).
  - Código enviado: pelo menos 6 dígitos, válido por no máximo "10 minutes when sent via text message or voice" ou "24 hours when sent to an email address" (§4.2.1.2).
- **Recuperação em nível AAL2** exige "Two recovery codes obtained using different methods", ou um código mais um autenticador ainda vinculado (§4.2.2.2). Toda recuperação "SHALL cause a notification" (§4.2.3).
- **Ressalva (inferência minha):** o NIST trata de recuperar **a conta**. Ele não resolve o problema de recuperar **uma chave de dados cifrados de ponta a ponta**. Serve como piso de boas práticas, não como arquitetura.

### Como os apps de conhecimento zero resolvem (páginas oficiais)
| App | O que oferece | Se esquecer tudo |
|---|---|---|
| **Bitwarden** | Dica da senha por e-mail; acesso de emergência (contato de confiança, só no Premium, com prazo de espera, modo "ver" ou "assumir"); recuperação pelo administrador da organização | "there is no way for Bitwarden to recover the account or its data. You will need to delete your account and create a new one." ([esqueci a senha](https://bitwarden.com/help/forgot-master-password/), [acesso de emergência](https://bitwarden.com/help/emergency-access/)) |
| **1Password** | Emergency Kit (PDF com e-mail, Secret Key, espaço para a senha e QR); recuperação pelo organizador da família ou administrador do time; desbloqueio biométrico; código de recuperação salvo | "no one can reset your password" ([esqueci a senha](https://support.1password.com/forgot-account-password/), [Emergency Kit](https://support.1password.com/emergency-kit/)) |
| **Proton** | Frase de 12 palavras, arquivo de recuperação, aparelho já conectado, senha antiga. **E-mail e SMS só redefinem a senha.** | Conta volta, dados cifrados não ([Proton](https://proton.me/support/recover-encrypted-messages-files)) |
| **Apple, Proteção Avançada de Dados** | Obriga a configurar pelo menos um contato de recuperação ou uma chave de recuperação antes de ativar; também aceita o código de outro aparelho | "Apple will not have the encryption keys to help you recover it" ([Apple](https://support.apple.com/en-us/102651)) |
| **Standard Notes** | A página oficial deu 403. Por fontes secundárias: não existe reset, a única saída é apagar a conta e começar de novo. **Não confirmado na fonte primária.** | Dados perdidos ([resultado de busca](https://standardnotes.com/help/6/i-ve-forgotten-my-password-what-should-i-do)) |

**Padrão que se repete:** nenhum desses apps usa e-mail ou SMS para devolver dados. Todos usam algo que **o usuário guarda** (kit, frase, arquivo), **um aparelho já confiável** ou **outra pessoa** (contato, administrador). A Apple chega a proibir ativar a proteção sem um desses.

### Passkeys com a extensão PRF
- **O que é:** a PRF devolve uma saída pseudoaleatória ligada à credencial, útil para "Generating symmetric encryption keys", e funciona tanto no `create()` quanto no `get()` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/WebAuthn_extensions)).
- **Suporte em agosto de 2026**, pela matriz de testes da Corbado, atualizada em ago/2026 ([Corbado](https://www.corbado.com/blog/passkeys-prf-webauthn)):
  - **Chrome com Google Password Manager:** sim, no cadastro e no login. "Every passkey stored in GPM supports PRF."
  - **Safari 18+ no macOS 15+ e no iOS 18+ com iCloud Keychain:** sim, mas houve "Bugs causing data loss as CDA Source in 18.0-18.3", corrigidos a partir da 18.4.
  - **Windows Hello:** sem PRF antes de fevereiro de 2026. No Windows 11 25H2 funciona com Chrome/Edge 147+ e Firefox 148+.
  - **Firefox no Android:** "No support yet".
  - **Gerenciadores de terceiros:** 1Password, Proton Pass e Keeper funcionam. Bitwarden e Dashlane falham ou não devolvem o valor ao site.
- **Segunda fonte, mais antiga (meados de 2025):** o guia da Yubico confirma o Safari 18+ no iOS só com autenticador de plataforma. Ele recomenda **envelope encryption**, com uma cópia embrulhada da chave de dados para cada credencial ([Yubico](https://developers.yubico.com/WebAuthn/Concepts/PRF_Extension/Developers_Guide_to_PRF.html)).
- **Evidência contrária, que pesa:**
  - Tim Cappalli, que trabalha na padronização do WebAuthn, escreveu em 27/02/2026: "stop promoting and using passkeys to encrypt user data". Ele só aceita o uso quando existem outros métodos, como nos gerenciadores de senha: "master passwords, per-device keys, recovery keys" ([Cappalli](https://blog.timcappalli.me/p/passkeys-prf-warning/)).
  - Andrew Lilley Brinker, em 14/01/2026: os dados "are gone even when the user regains account access" ([Brinker](https://www.alilleybrinker.com/blog/passkey-prf-risks/)).
- **Se a pessoa perder a conta Google ou Apple:**
  - Google: sem o PIN do Gerenciador de Senhas e sem nenhum aparelho, o reset "deletes all your passkeys" ([Google](https://support.google.com/chrome/answer/16608973?hl=en&co=GENIE.Platform%3DDesktop)).
  - Apple: as passkeys são cifradas de ponta a ponta e recuperáveis pelo depósito do iCloud Keychain, que pede o código do aparelho antigo ([Apple](https://support.apple.com/en-us/102195)).
  - Em qualquer dos dois casos, perder a passkey significa perder aquele embrulho da chave.
- **Inferência minha:** a passkey fica presa ao domínio (RP ID). Se o app mudar de domínio, todas as passkeys param de funcionar.

### Canais de envio e preços
- **WhatsApp, taxa da Meta.** Cobrança por mensagem entregue desde 1/7/2025. Contas em reais para empresas brasileiras a partir de 1/7/2026 ([Meta for Developers](https://developers.facebook.com/docs/whatsapp/pricing)). O valor para o Brasil **não aparece em texto na página da Meta**: a tabela é um widget interativo ([WhatsApp Business](https://whatsappbusiness.com/pt-br/products/platform-pricing/)).
  - Três fontes secundárias independentes dão **US$ 0,0068 por mensagem de autenticação no Brasil, tabela de julho de 2026**: [Authgear](https://www.authgear.com/post/whatsapp-api-pricing/) (atualizado em 09/07/2026), [Whautomate](https://whautomate.com/whatsapp-business-api-pricing-brazil) ("Last verified against Meta's official rate card: July 2026") e [EngageLab](https://www.engagelab.com/blog/whatsapp-business-api-pricing).
  - Um resultado de busca cita R$ 0,15–0,19. A Ominiflow cita US$ 0,0315 "per 24-hour conversation", que é o modelo antigo, anterior a julho de 2025. **Considero os dois desatualizados ou com taxa de revenda embutida.**
- **WhatsApp, regras do modelo de autenticação.** O texto é fixo ("<VERIFICATION_CODE> is your verification code."), não aceita URL, tem botão de copiar código e validade de 1 a 90 minutos ([Meta, modelos de autenticação](https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates)). **Por fonte secundária, não confirmado na Meta:** conta sem verificação empresarial fica limitada a 250 mensagens por 24h e não envia código ([Blueticks](https://blueticks.co/blog/whatsapp-api-without-meta-verification), [Chatarmin](https://chatarmin.com/en/blog/whats-app-messaging-limits)).
- **WhatsApp e SMS pela Twilio.** A Twilio cobra US$ 0,005 por mensagem de WhatsApp, além da taxa da Meta ([Twilio WhatsApp](https://www.twilio.com/en-us/whatsapp/pricing), "current as of August 2026"). O Twilio Verify cobra "$0.05 per successful verification" mais o canal ([Twilio Verify](https://www.twilio.com/en-us/verify/pricing)).
- **SMS para o Brasil:**
  - **Twilio:** US$ 0,0599 por SMS para todas as operadoras (CSV oficial de preços: [CSV](https://www.twilio.com/content/dam/twilio-com/pricing-data/en/csv/PMded94a0dae30eaaec0f115f22859bd38_SMSPricing.csv)).
  - **Plivo:** US$ 0,0484–0,0705 conforme a operadora ([Plivo](https://www.plivo.com/sms/pricing/br/)).
  - **Zenvia:** "a partir de R$ 0,100 por mensagem (até 1.000 disparos)", com mensalidade à parte. Isso veio do resumo da busca e **não foi confirmado na página da Zenvia** ([Zenvia preços](https://zenvia.com/en/prices/)).
  - **AWS:** o preço por operadora só está num CSV que **não li** ([AWS End User Messaging](https://aws.amazon.com/end-user-messaging/pricing/)).
- **E-mail:**
  - **Resend:** plano grátis com 3.000 e-mails/mês e limite de 100/dia; Pro a US$ 20/mês com 50.000 e-mails ([Resend](https://resend.com/pricing)).
  - **Amazon SES:** US$ 0,10 por 1.000 e-mails no avulso ([SES](https://aws.amazon.com/ses/pricing/)).
  - **Supabase:** o e-mail embutido tem limite de "2 messages per hour", só entrega para membros do time, e a própria Supabase pede SMTP próprio em produção ([Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp)).
- **Servidor:**
  - **Cloudflare Workers:** grátis até 100.000 requisições/dia; plano pago a partir de US$ 5/mês ([Cloudflare](https://developers.cloudflare.com/workers/platform/pricing/)).
  - **Supabase:** Free com 50.000 usuários ativos/mês e 500 MB, mas "Free projects are paused after 1 week of inactivity"; Pro a US$ 25/mês ([Supabase](https://supabase.com/pricing)).
- **Câmbio usado:** PTAX de 04/09/2026, R$ 5,1253 ([Divulgar Dinheiro](https://divulgardinheiro.com/cotacao-do-dolar-hoje-dolar-comercial-ptax-fecha-em-alta-apos-relatorio-de-emprego-dos-eua/)). Arredondei para **R$ 5,13**. É fonte secundária; para orçamento real, confira a PTAX no Banco Central.

### Troca de chip (SIM swap) no Brasil
- **Como funciona:** o golpista se passa pelo cliente na operadora, pede a troca do chip e passa a receber os códigos por SMS. TIM, Claro e Vivo vendem serviços de alerta ou proteção contra isso ([TechTudo](https://www.techtudo.com.br/guia/2025/11/sim-swap-entenda-o-que-e-o-golpe-do-chip-e-como-nao-ser-uma-vitima-edapps.ghtml), 02/11/2025, atualizado em 09/04/2026). A matéria **não traz estatística**.
- **Regras novas: não confirmado em fonte oficial.** Um site afirma que a Anatel passou a exigir biometria facial na troca de chip e na portabilidade desde abril de 2026, mas a página deu 403 e não achei o ato da Anatel. A Telesíntese noticia que a Câmara aprovou o PL 352/2025 em 28/10/2025, com 360 dias para entrar em vigor se sancionado. Não verifiquei se foi sancionado.
- **Inferência:** o WhatsApp também é ativado por SMS. Quem não liga a confirmação em duas etapas (PIN) do WhatsApp fica exposto ao mesmo golpe. Não consegui ler a FAQ oficial do WhatsApp sobre esse PIN.

### LGPD
- **Hoje o app provavelmente fica fora da lei.** "Esta Lei não se aplica ao tratamento de dados pessoais [...] realizado por pessoa natural para fins exclusivamente particulares e não econômicos" (art. 4º, I, via [lgpd-brasil.info](https://lgpd-brasil.info/capitulo_01/artigo_04)). Enquadrar o FinançasPro 100% local nessa exceção, ou dizer que o desenvolvedor nem é controlador, **é inferência minha, não parecer jurídico**.
- **Dados financeiros não são "sensíveis"** na lista do art. 5º, II ([lgpd-brasil.info](https://lgpd-brasil.info/capitulo_01/artigo_05)).
- **Mas contam como risco relevante em incidente.** A Resolução CD/ANPD nº 15/2024 lista "dados financeiros" e "dados de autenticação em sistemas" entre os critérios (art. 5º, III e IV). A comunicação à ANPD deve sair em "três dias úteis" (art. 6º), e o registro de incidentes deve ser guardado por no mínimo cinco anos (art. 10) ([LegisWeb](https://www.legisweb.com.br/legislacao/?id=458235)).
- **Art. 48:** o controlador deve comunicar à ANPD e ao titular o incidente "que possa acarretar risco ou dano relevante" ([lgpd-brasil.info](https://lgpd-brasil.info/capitulo_07/artigo_48)).
- **Agente de pequeno porte** (Resolução CD/ANPD nº 2/2022): fica dispensado de nomear encarregado, mas precisa manter um canal com o titular (art. 11), e tem prazos em dobro (arts. 14-15). **Perde esses benefícios** se fizer tratamento de alto risco, ou seja, um critério geral (larga escala ou efeito relevante sobre direitos) somado a um específico (tecnologia inovadora, dados sensíveis, dados de crianças ou idosos...) (arts. 3º-4º) ([gov.br/ANPD](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022)).
- **Transferência internacional** (Meta, Twilio e Cloudflare processam fora do Brasil): exige mecanismo válido, como as cláusulas-padrão da Resolução CD/ANPD nº 19/2024, cujo prazo de adequação acabou em 23/08/2025 ([ANPD](https://www.gov.br/anpd/pt-br/assuntos/noticias/resolucao-normatiza-transferencia-internacional-de-dados), [Mayer Brown](https://www.mayerbrown.com/pt/insights/publications/2025/08/end-of-grace-period-implementation-of-brazils-standard-contractual-clauses-in-international-transfers-of-personal-data)).
- **Multa:** até 2% do faturamento, limitada a R$ 50 milhões por infração (art. 52, II; confirmado por várias fontes secundárias, e o Planalto não abriu).

---

## Análise / comparação

### A tensão central: quem consegue ler os dados em cada opção

Para recuperar um cofre cifrado de ponta a ponta, **alguém precisa guardar algo capaz de reabrir a `dataKey`**. A pergunta é quem:

- **O usuário, num objeto** (kit, frase, arquivo): só quem pegar o objeto lê.
- **O aparelho do usuário** (passkey, biometria): só quem desbloquear o aparelho lê.
- **Outra pessoa** (contato de confiança): o contato mais o aparelho, se a chave for dividida, ou só o contato, se não for.
- **O servidor** (custódia): o operador, quem invadir o servidor e quem enganar o canal de envio do código, se tiver também o texto cifrado.

WhatsApp, SMS e e-mail **não são mecanismos de guarda**. São só o canal que prova "sou dono deste número ou e-mail" para quem guarda a chave, no caso, um servidor. Por isso a tabela principal compara **mecanismos**, e a segunda compara **canais** dentro do único mecanismo com servidor que eu recomendaria (chave dividida).

### Tabela 1: mecanismos

Volume usado nos custos (**estimativa minha, sem dado de mercado**): 1.000 usuários ativos, 5% recuperando por mês (50 recuperações, 1,5 mensagem cada) mais 200 confirmações de telefone ou e-mail no cadastro, ou seja, **cerca de 275 mensagens/mês**. No cenário pessimista, **1.000 mensagens/mês**. Câmbio R$ 5,13. Domínio, tempo de desenvolvimento e advogado ficam de fora.

| Critério | 1. Custódia no servidor (chave inteira) | 1b. Chave dividida servidor + aparelho | 2. Passkey PRF (sem servidor) | 3. Kit de recuperação | 4. Contato de confiança |
|---|---|---|---|---|---|
| **Quem consegue ler os dados financeiros** | O operador do servidor, quem invadir o servidor e quem sequestrar o e-mail ou chip, **desde que tenha também o texto cifrado**. Hoje o texto cifrado só está no aparelho; com a sincronização da Fase 2, o servidor tem os dois e **lê sozinho**. | Só quem tiver **o aparelho e o canal** (e-mail ou telefone) ao mesmo tempo. O servidor sozinho não lê: tem só metade da chave e nunca vê o texto cifrado. | Quem desbloquear o aparelho ou a conta Google/Apple onde a passkey está sincronizada, e também tiver o `localStorage`. Nem Google nem Apple leem: o Gerenciador de Senhas é cifrado de ponta a ponta. | Só quem pegar o kit, e também tiver o `localStorage` ou o backup. | Com chave dividida: o contato **e** o aparelho. Sem divisão: o contato sozinho, se tiver o backup. |
| **O que o usuário precisa ter para recuperar** | Acesso ao e-mail ou telefone | Este aparelho e navegador intactos, mais o e-mail ou telefone | Um aparelho com a passkey (biometria ou PIN do aparelho) | O papel ou arquivo do kit | Um contato disponível, mais este aparelho |
| **Infraestrutura** | API, banco de dados, provedor de e-mail/SMS, gestão de chaves; mudar o CSP | API pequena (um KV com a metade da chave e o contato), provedor de envio; mudar o CSP | Nenhuma. O app precisa ficar num domínio fixo (RP ID) | Nenhuma | Nenhuma, na versão com cartões em papel ou QR |
| **Custo estimado (R$/mês, 1.000 ativos), estimativa minha** | Supabase Pro US$ 25 ≈ **R$ 128** + e-mail (Resend grátis) → **≈ R$ 130**. Com SMS pela Twilio, **+R$ 85 a 307** | Workers grátis ou US$ 5 (R$ 26) + canal (tabela 2) → **R$ 0 a 60 com e-mail ou WhatsApp**, **R$ 85 a 335 com SMS** | **R$ 0** | **R$ 0** | **R$ 0** |
| **Principais riscos** | Invasão do servidor vira vazamento de dados financeiros; troca de chip ou e-mail sequestrado abre o cofre; pedido judicial pode forçar a entrega; muda o enquadramento na LGPD | Alguém da casa com acesso ao computador e ao e-mail aberto no mesmo navegador; troca de chip mais roubo do aparelho; indisponibilidade do servidor impede recuperar; não resolve a perda B | Passkey apagada, conta Google/Apple perdida ou bug do Safari 18.0–18.3 **perdem esse embrulho**; suporte desigual (Firefox Android sem PRF, Bitwarden e Dashlane falham); o usuário não entende a relação entre passkey e dados | Kit perdido, fotografado ou salvo em nuvem sem cuidado; o usuário não guarda | Contato morre, some ou conspira; engenharia social; complexidade de explicar |
| **Esforço nesta base de código** | **G**: provedor novo, API, SMTP, políticas LGPD, fluxo de reset, testes | **G**: API, verificação empresarial na Meta (se WhatsApp), CSP, novo embrulho em `VaultEnvelope`, espera e aviso | **M**: novo tipo de embrulho em `VaultEnvelope` (`crypto.ts:14-24`), chamadas WebAuthn, detecção de suporte, telas | **P**: frase e wordlist já existem; falta regenerar em Configurações (a `dataKey` já está na sessão), imprimir e verificar | **M**: dividir o segredo (sem biblioteca, ou com uma como Shamir), telas de cartões |
| **Impacto em "só você acessa seus dados"** | **Quebra.** Vira "você e nós" | **Enfraquece de forma explicável:** "você, ou quem tiver seu aparelho e seu telefone". Precisa ser opcional | **Mantém** | **Mantém** (é o modelo atual, melhorado) | **Mantém**, se a chave for dividida com o aparelho |

### Tabela 2: canais (dentro da opção 1b)

| Critério | 5. Código por WhatsApp | 6. Código por SMS | 7. Código por e-mail |
|---|---|---|---|
| **Quem consegue ler os dados** | Quem tiver o aparelho e sequestrar o WhatsApp (por troca de chip, se não houver PIN de duas etapas). A Meta vê o código, não os dados. | Quem tiver o aparelho e fizer troca de chip ou portabilidade. A operadora e o agregador de SMS veem o código. | Quem tiver o aparelho e o e-mail. **No mesmo computador o e-mail costuma estar aberto**, e aí a proteção cai para quase nada. |
| **O que o usuário precisa ter** | O número ativo no WhatsApp | O chip ativo | Acesso à caixa de entrada |
| **Infraestrutura** | Conta WhatsApp Business, verificação empresarial (secundário: CNPJ provável, **não confirmado**), modelo aprovado, token guardado no servidor | Conta num agregador (Twilio, Zenvia, Plivo) | SMTP transacional (Resend, SES) |
| **Custo (R$/mês), estimativa minha** | Direto na Meta: 275 × US$ 0,0068 ≈ **R$ 10**; 1.000 ≈ **R$ 35**. Pela Twilio: +US$ 0,005/msg (≈ R$ 17–61); com o Verify, +US$ 0,05 por verificação (≈ R$ 64–256) | Twilio: 275 × US$ 0,0599 ≈ **R$ 85**; 1.000 ≈ **R$ 307**. Zenvia (não confirmado): R$ 0,10/msg ≈ R$ 28–100 + mensalidade | **R$ 0** (Resend grátis até 3.000/mês e 100/dia); SES < R$ 1 |
| **Riscos** | Troca de chip leva ao WhatsApp; dependência de política da Meta; bloqueio de conta empresarial | Autenticador "restrito" pelo NIST (§3.2.9); troca de chip é golpe comum no Brasil; entrega irregular | O NIST proíbe e-mail como autenticador (§3.1.3.1); a pessoa perde o e-mail antigo; e-mail aberto no mesmo aparelho |
| **Esforço** | G (burocracia da Meta mais servidor) | G | M/G (o mais simples dos três, mas ainda exige servidor) |
| **Impacto na promessa** | Médio | Médio a alto | Alto, se o e-mail estiver no mesmo aparelho |

### Qual critério pesa mais

**"Quem consegue ler os dados financeiros"** vem primeiro, e não é gosto pessoal. O relatório de 2026-09-10 mostrou que privacidade e custo zero são o que diferencia o app de Organizze, Mobills e cia. Uma opção que quebra isso troca o diferencial por conveniência, e aí o usuário comparará com apps que já têm Open Finance.

**Em segundo lugar:** a chance real de um usuário comum conseguir recuperar. Um método perfeito que ninguém guarda não serve. Nesse ponto a frase atual falha, e o kit e a passkey melhoram muito sem custo.

---

## Recomendação

**Combinar a opção 3 (kit) com a opção 2 (passkey PRF como embrulho extra), e deixar a 1b com WhatsApp como opção avançada, ligada pelo usuário, só se o dono quiser mesmo o telefone.** Descartar a opção 1 e o SMS.

1. **Kit de recuperação no lugar da "frase de uma vez só"** (esforço P, R$ 0):
   - Em Configurações: "Gerar novo kit", que chama `addRecoveryWrap` com a `dataKey` da sessão e invalida o anterior, como o NIST pede em §4.2.1.1.
   - Página imprimível com as 12 palavras, nome da conta, data e instrução, sem dependência nova (`window.print`).
   - Confirmar 2 ou 3 palavras antes de concluir o cadastro.
   - **Deixar o backup `.financas.enc` abrir também com o kit.** Hoje ele exige uma terceira senha (`SettingsModal.tsx:122`). É isso que resolve a perda B de verdade.
2. **Desbloqueio por biometria com passkey PRF, como embrulho adicional** (esforço M, R$ 0):
   - Cada passkey vira mais uma cópia embrulhada da `dataKey` (o padrão de envelope da Yubico). Senha e kit continuam valendo. Isso segue exatamente a condição do Cappalli: PRF só como um de vários métodos.
   - Resolve a perda A para a maioria das pessoas ("esqueci a senha, mas tenho a digital").
   - Mostrar só quando o navegador devolver PRF de fato. A Corbado mostrou navegadores que anunciam suporte e não entregam o valor.
   - Avisar que apagar a passkey remove esse atalho.
3. **Opcional: "Recuperar pelo WhatsApp neste aparelho" (1b)**, esforço G, cerca de R$ 10–60/mês:
   - O servidor guarda só metade da chave e o número de telefone.
   - Ativado pelo usuário, com espera de 24–72h e aviso na tela ao abrir o app. A espera imita o acesso de emergência do Bitwarden.
   - Pedir que o usuário ative o PIN de duas etapas do WhatsApp.
   - Preferir WhatsApp a SMS: é cerca de 9 vezes mais barato (US$ 0,0068 contra 0,0599), o canal é cifrado e o SMS é restrito pelo NIST.
   - Preferir WhatsApp a e-mail: o celular é outro aparelho, enquanto o e-mail costuma estar aberto no mesmo navegador.
4. **Rever a Fase 2 do README** antes de começar: "reset de senha por e-mail" com cofre cifrado recupera a conta, não os dados (caso Proton). Se a Fase 2 sair, a recuperação entre aparelhos continua dependendo do kit ou de uma passkey sincronizada.
5. **Corrigir o bloqueio de tentativas**, que some ao recarregar a página, e subir a senha mínima de 6 caracteres. Qualquer recuperação "neste aparelho" depende de o aparelho não ser fácil de atacar offline.

**Principal risco da recomendação:** o dono queria "mais fácil que a frase", e os passos 1 e 2 ainda pedem que o usuário **guarde um papel** ou **tenha uma passkey**. Quem não fizer nenhum dos dois continua perdendo tudo. A mitigação é tornar o kit inevitável (confirmação no cadastro, lembrete periódico em Configurações) e a biometria o caminho padrão. Se isso não bastar, o passo 3 é a concessão consciente, e deve vir com o texto honesto: "quem tiver este computador e seu WhatsApp consegue abrir seus dados".

---

## Confiança e lacunas

**Alta** para:
- o código (li os arquivos e cito as linhas);
- o NIST (li o PDF oficial, versão final de julho de 2025);
- as políticas de recuperação de Bitwarden, 1Password, Proton e Apple (páginas oficiais);
- os preços de e-mail, Cloudflare, Supabase e SMS da Twilio (páginas e CSV oficiais).

**Média** para:
- o preço do WhatsApp no Brasil (três fontes secundárias concordam, mas não consegui ler a tabela da Meta);
- o suporte a PRF (uma matriz de testes de agosto de 2026 e um guia de 2025);
- o volume de 275 mensagens/mês e todos os custos em reais, que são estimativas minhas.

**Baixa ou sem resposta:**
- Se a verificação empresarial da Meta exige CNPJ e se conta não verificada envia código (só fontes secundárias).
- O ato da Anatel sobre biometria na troca de chip e a sanção do PL 352/2025 (páginas deram 403).
- Estatística confiável de troca de chip no Brasil: não encontrei.
- Preço da Zenvia e o CSV da AWS: não confirmados.
- A página de ajuda do Standard Notes (403).
- Se o FinançasPro local fica mesmo fora da LGPD pelo art. 4º, I. Isso pede um advogado.
- Se o autenticador virtual do Playwright/Chrome simula PRF, o que afeta o esforço de teste da opção 2.

**O que resolveria:**
- Abrir a tabela de preços da Meta logado no Business Manager.
- Consultar um advogado de LGPD sobre o modelo 1b.
- Testar a PRF no Chrome Android, no Safari iOS 18.4+ e no Windows Hello com um protótipo descartável.
- Perguntar a 5 usuários se guardariam um kit impresso.

# FinançasPro

[English version](README.en.md)

Gerenciador financeiro pessoal com criptografia ponta a ponta. Importa extratos bancários e faturas de cartão de crédito, consolida os gastos mensais por categoria e protege tudo com AES-256. Seus dados nunca ficam gravados em texto legível.

O app roda **100% no navegador por padrão**: sem conta, sem servidor, sem telemetria. Existe um **modo nuvem opcional** (Supabase + Cloudflare) que liga conta por e-mail e sincronização entre aparelhos — e que só entra no aplicativo se quem publica configurar duas variáveis de ambiente.

## Screenshots

| Login | Dashboard |
|---|---|
| ![Tela de login](docs/screenshots/login.png) | ![Dashboard com gráficos](docs/screenshots/dashboard.png) |

| Importar extrato | Cartão de crédito |
|---|---|
| ![Importar extrato com categorização automática](docs/screenshots/import.png) | ![Módulo de cartão de crédito](docs/screenshots/credit-card.png) |

As capturas são de julho de 2026 e ainda não mostram a importação de fatura, o kit de recuperação nem a densidade atual da interface.

## Por que é diferente

- **Privacidade real**: criptografia E2E no cliente. Nenhum servidor vê seus dados, e não há telemetria nem analytics. A chave que abre os dados só existe em memória enquanto você está logado — inclusive no modo nuvem, onde o servidor guarda apenas texto cifrado.
- **Local por padrão**: sem as variáveis do Supabase, o build não contém nenhuma linha de código de nuvem (uma verificação no fim do build confere isso).
- **Kit de recuperação renovável**: 12 palavras com id curto e folha imprimível. Gerar um kit novo gira a chave dos dados e invalida o anterior de verdade.
- **Backup cifrado**: exporta `.financas.enc` que abre com o kit **ou** com a senha da conta da época. Não existe senha separada de backup.
- **Multiusuário familiar** (modo local): cada conta tem senha própria e cofre isolado no mesmo navegador.
- **Custo de infra zero ou quase**: o modo local roda em qualquer host estático; o modo nuvem foi dimensionado para os planos gratuitos de Cloudflare e Supabase.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| UI | React 19, TypeScript 6, Tailwind CSS 4 |
| Build | Vite 8 |
| Gráficos | Recharts |
| Parsing | PapaParse, pdfjs-dist |
| Criptografia | Web Crypto API (PBKDF2-SHA256, AES-256-GCM, HKDF) |
| Validação | Zod |
| Nuvem (opcional) | Supabase (Auth + Postgres), Cloudflare Workers com arquivos estáticos |

## Rodando localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`. Sem nenhuma variável de ambiente, o app sobe no modo local: cadastro com nome e senha, dados no `localStorage` deste navegador.

### Rodando em modo nuvem

Precisa de um projeto Supabase já configurado ([`docs/deploy/supabase.md`](docs/deploy/supabase.md), seções 1 a 7). Crie `.env.local` na raiz (o `.gitignore` já o ignora):

```dotenv
VITE_SUPABASE_URL=https://abcd1234.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

```bash
npm run dev
```

A tela de entrada passa a pedir **e-mail**. Se ela continuar pedindo nome e senha, as variáveis não chegaram ao build.

### Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (Vite) |
| `npm run build` | `tsc -b`, build de produção e a guarda de bundle (`scripts/check-bundle.mjs`) |
| `npm run preview` | Serve a pasta `dist` já construída |
| `npm run lint` | ESLint em todo o repositório |
| `npm run test` | Testes unitários (Vitest, uma rodada) |
| `npm run test:watch` | Vitest em modo interativo |
| `npm run test:e2e` | Playwright no modo local |
| `npm run test:e2e:cloud` | Playwright no modo nuvem contra um Supabase simulado (`e2e-cloud/mockSupabase.ts`); não roda na CI |
| `npm run check:bundle` | Confere a pasta `dist`; com `-- --expect-local`, também exige que não haja código de nuvem |

A CI (GitHub Actions) roda lint, testes unitários, build, `check:bundle -- --expect-local` e o Playwright do modo local.

### Variáveis de ambiente

Todas são **públicas**: vão para o JavaScript do navegador. Modelo completo em [`.env.example`](.env.example).

| Variável | Obrigatória | Efeito |
|---|---|---|
| `VITE_SUPABASE_URL` | só no modo nuvem | Project URL do Supabase. Precisa ser `https` (exceto `localhost`). |
| `VITE_SUPABASE_ANON_KEY` | só no modo nuvem | Publishable key (`sb_publishable_...`) ou a anon public antiga. Alias aceito: `VITE_SUPABASE_PUBLISHABLE_KEY`. |
| `VITE_FORCE_LOCAL` | não | `true` força o modo local mesmo com as duas acima preenchidas. |
| `VITE_APP_MODE` | não | Chave antiga mantida por compatibilidade: `local` força o modo local. |

O build **falha** se `VITE_SUPABASE_ANON_KEY` contiver uma chave secreta (`sb_secret_...` ou um JWT `service_role`), e a guarda de bundle recusa um `dist` que contenha uma delas.

Publicar: [`docs/deploy/supabase.md`](docs/deploy/supabase.md) (banco, autenticação, e-mail) e [`docs/deploy/cloudflare.md`](docs/deploy/cloudflare.md) (site).

## Funcionalidades

- **Extrato bancário** (aba **Importar Extrato**): CSV, OFX e QFX com um leitor genérico para qualquer banco da lista; PDF com texto selecionável só de Neon e Banrisul.
- **Fatura do cartão de crédito** (aba **Cartão de Crédito** → **Importar fatura**): CSV ou PDF com texto selecionável, com um leitor genérico para qualquer banco. Antes de salvar, a pré-visualização mostra em qual fatura cada compra cai e em que mês o total entra nos gastos.
- **Lançamentos repetidos**: ao importar, o app ignora o que já está salvo e lista o que foi ignorado. Lançamentos idênticos no mesmo arquivo são mantidos.
- **Rascunho entre abas**: a pré-visualização de uma importação continua lá se você trocar de aba. Ela fica só em memória e é descartada ao sair da conta ou recarregar a página.
- **Kit de recuperação** com id curto e folha imprimível, criado junto com a conta (no cadastro, no modo local; em **Configurar cofre**, no modo nuvem) e renovável em Configurações.
- **Backup cifrado** que abre com o kit ou com a senha da conta da época.
- Dashboard mensal: entradas, saídas em conta, faturas no mês de vencimento e compras abertas.
- Composição de gastos por categoria, tipo e comerciante (com filtros).
- Regras de categorização automática (por trecho da descrição).
- Autenticação local com rate limit (5 tentativas, bloqueio de 5 min).
- Temas claro, escuro e automático.
- Auto-lock após 15 minutos de inatividade.
- Onboarding guiado para novos usuários.

### No modo nuvem

- Conta por **e-mail e senha**, com confirmação de e-mail e senha mínima de 12 caracteres (o app recusa senhas comuns e senhas que contenham o seu e-mail).
- **Cofre cifrado no Supabase**: o cofre inteiro vira um único blob comprimido e cifrado, com número de versão. O servidor nunca vê o conteúdo.
- **Sincronização entre aparelhos**, com um selo no topo (**Sincronizado** / **Sincronizando...** / **Sem sincronizar**). Edições feitas sem internet ficam no aparelho e sobem quando a conexão volta.
- **Conflito nunca é resolvido sozinho**: quando dois aparelhos editam a mesma versão, o app pergunta qual manter.
- **Esqueci a senha** por e-mail e **Abrir dados com o kit** para devolver os dados depois da redefinição.
- **Beta fechado**: só e-mails cadastrados na tabela `beta_allowlist` conseguem criar conta.

## Recuperação de conta

> **O e-mail devolve o acesso à conta. Só o kit de recuperação abre os dados.**

| O que você tem | O que você recupera |
|---|---|
| E-mail e senha (ou, no modo local, a senha) | Tudo |
| A senha, sem acesso à caixa de e-mail | Tudo, enquanto lembrar a senha |
| O e-mail, não a senha, **com** o kit | A conta e os dados |
| O e-mail, não a senha, **sem** o kit | Só o acesso à conta; os dados só voltam de um backup |
| Nada disso | Nada: ninguém no projeto tem a sua chave |

Tabela completa (modo local e modo nuvem), como imprimir e guardar o kit, quando gerar um novo e o que muda nos backups: [`docs/RECUPERACAO-DE-CONTA.md`](docs/RECUPERACAO-DE-CONTA.md).

## Como o app conta o seu dinheiro

- **Compra no cartão não conta no dia da compra.** Ela entra nos gastos pelo **total da fatura**, no **mês de vencimento**, mesmo que a fatura não esteja marcada como paga.
- Compra feita **depois** do dia de fechamento do cartão vai para a fatura seguinte.
- **Compras abertas** são as compras cuja fatura vence depois do mês que você está vendo. Elas aparecem separadas e ficam fora do total do mês.
- No extrato bancário, lançamentos do tipo **Crédito** e o **pagamento da fatura** ficam fora dos gastos, para não contar o cartão duas vezes.
- **Repetidos**: no extrato, contam data + descrição + valor + banco; na fatura, cartão + data + descrição + valor. O nome do arquivo não conta.

Regras completas, exemplos com datas e o que fazer quando um lançamento cai no lugar errado: [`docs/IMPORTACAO-E-CALCULOS.md`](docs/IMPORTACAO-E-CALCULOS.md).

## Limitações conhecidas da importação

- **Estorno na fatura aumenta o total**: o valor negativo é lido como compra positiva.
- **Juros, encargos e anuidade não entram** no total da fatura. Compras cujo nome contém `total`, `juros`, `limite` e outras palavras do filtro também são descartadas.
- **Compra parcelada com a data original** vai para a fatura daquele mês antigo, ou é descartada se a data vier sem ano e fora do período da fatura.
- **Editar fechamento ou vencimento** não move compras já importadas para outra fatura.
- **Duas compras diferentes** com cartão, data, descrição e valor iguais, vindas de arquivos diferentes, viram uma só.
- **No extrato**, uma compra no débito descrita só como "cartão" (sem "débito") é tratada como Crédito e sai dos gastos.
- **Compras de cartão importadas não podem ser excluídas** individualmente. A única forma de desfazer é **Resetar dados**, que apaga tudo.

Detalhes, como perceber cada caso e contornos: [`docs/IMPORTACAO-E-CALCULOS.md#5-limitações-conhecidas`](docs/IMPORTACAO-E-CALCULOS.md#5-limitações-conhecidas).

Histórico de mudanças: [`CHANGELOG.md`](CHANGELOG.md).

## Modelo de segurança

### Conta local

```
Senha do usuário
    |
    v
PBKDF2-SHA256 (310k iterações, salt aleatório)
    |
    +--> authKey --> verifier (hash armazenado, nunca a senha)
    |
    +--> unwrap --> DataKey (AES-256, aleatória por usuário)
                       |
                       +--> cifra/decifra todo o cofre financeiro
                       +--> também embrulhada pelas 12 palavras do kit
                       +--> zerada em memória no logout/timeout/reload
```

### Conta na nuvem

```
E-mail ---> authSalt = SHA-256("financaspro/auth-salt/v1|" + e-mail)
              |
Senha --------+--> PBKDF2-SHA256 (600k iterações) --> master
                                                       |
                        HKDF "financaspro/auth/v1" ----+--> authSecret --> vai ao Supabase
                                                       |                   (que guarda um hash dele)
                        HKDF "financaspro/wrap/v1" ----+--> pwWrapKey ----> nunca sai do navegador
                                                                              |
                                                                              v
                                                       embrulha a DataKey, que cifra o cofre
```

**O que vai ao servidor**: o e-mail, o `authSecret` derivado da senha (o Supabase guarda um hash dele), o cofre cifrado, os embrulhos de chave (também cifrados) e o histórico dos dois. **O que nunca sai do navegador**: a senha, a `DataKey` que abre os dados e as 12 palavras do kit.

**Dados em repouso**: o `localStorage` só contém blobs cifrados e metadados de autenticação. Nenhuma descrição, valor ou nome de cartão fica legível — no modo nuvem, a cópia local também é cifrada.

**Backup**: `.financas.enc` no formato v2 guarda os dados cifrados com a chave da conta, mais os embrulhos do momento da exportação: abre com o kit **ou** com a senha da conta daquele dia. Arquivos antigos (v1, com senha própria) continuam abrindo.

**O cofre nunca é sobrescrito quando não abre**: se os dados salvos não decifram, o app mostra uma tela de erro com **Tentar de novo**, **Sair da conta** e **Restaurar backup**, e guarda uma cópia do que não abriu antes de substituir qualquer coisa.

## O que o app não faz

- Não é open banking: não conecta diretamente ao seu banco.
- **No modo local, não envia nada a servidor nenhum.** No modo nuvem, envia apenas texto cifrado que o servidor não consegue abrir.
- Não recupera dados automaticamente por e-mail: o e-mail devolve só o acesso à conta.
- Não funde alterações de dois aparelhos automaticamente: em caso de conflito, você escolhe qual versão fica.
- Não permite trocar o e-mail de uma conta.
- Não protege contra malware com acesso total ao navegador em execução.

## Avisos do modo nuvem (beta)

- O link de **"Esqueci a senha"** só funciona no **mesmo navegador** que pediu o link (o fluxo PKCE guarda ali o verificador).
- **Trocar o e-mail da conta quebra o login**, porque o salt da senha deriva do e-mail.
- O **plano grátis do Supabase pausa o projeto** depois de dias sem uso. Nada é apagado: é preciso reativar no painel.
<!-- VERIFICAR: o prazo exato da pausa (o guia do Supabase diz 7 dias) vem do relatório de pesquisa, não de um projeto em uso; confirme no painel antes de prometer um número. -->
- **Conflito entre dois aparelhos** é resolvido por escolha sua, sem fusão automática.
- O **histórico de chaves** guarda no mínimo 30 dias (depois disso, as 10 versões mais recentes) e recusa mais de **20 trocas de chave em 24 horas**.
- Ainda **não existem** tela de opinião, página de privacidade/termos e telas de consentimento. **Não convide outras pessoas para o beta nesta etapa.**

## Arquitetura

Veja o diagrama completo e o mapa de módulos em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

Pontos de entrada principais:

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/App.tsx` | Shell principal; carrega o `CloudRoot` só em builds de nuvem |
| `src/lib/crypto/crypto.ts` | Primitivas PBKDF2, AES-GCM, wrap/unwrap, envelope do cofre |
| `src/lib/crypto/accountKeys.ts` | Derivação v2 das contas de nuvem (authSecret + pwWrapKey) |
| `src/lib/crypto/kit.ts` | Id do kit, normalização das palavras e sorteio da confirmação |
| `src/lib/auth/localAuthProviderV2.ts` | Contas locais sobre o provedor síncrono antigo |
| `src/lib/cloud/cloudAuthProvider.ts` | Contas de nuvem: entrada, kit, redefinição de senha, giro de chaves |
| `src/lib/cloud/syncEngine.ts` | Sincronização otimista com guarda de conflito |
| `src/lib/vault/` | `VaultStore` (local e nuvem) e o gravador com fila |
| `src/utils/secureStorage.ts` | Cofre cifrado no `localStorage`, com erros tipados |
| `src/context/FinanceContext.tsx` | Estado central e agregações financeiras |
| `src/utils/backup.ts` | Backup v2 (kit ou senha) e leitura dos formatos antigos |
| `supabase/migrations/0001_init.sql` | Tabelas, políticas e funções do banco |

## Roadmap

### Fase 1 — Base local segura (concluída)

Autenticação, criptografia E2E, backup cifrado, migração de dados legados, auto-lock, kit de recuperação, suíte de testes unitários (Vitest) e E2E (Playwright) com CI no GitHub Actions.

### Fase 2 — Conta com e-mail (concluída, em beta fechado)

Provedor de nuvem sobre o Supabase (login por e-mail, confirmação, redefinição de senha), cofre cifrado com versão na tabela `vaults`, RLS de "só o dono lê" com escrita apenas por funções, histórico de cofre e de chaves, sincronização entre aparelhos com resolução de conflito pelo usuário, "Abrir dados com o kit" e publicação em Cloudflare Workers.

O acesso é **fechado por lista de e-mails** (`beta_allowlist` + hook *Before User Created*): quem não está na lista não consegue se cadastrar.

### Fase 3 — Antes de abrir para outras pessoas

- Tela de opinião dentro do app (a tabela `feedback` já existe no banco; a tela, não)
- Página de privacidade e termos, e as telas de consentimento
- Checklist pré-go-live e documentação do modelo de ameaças

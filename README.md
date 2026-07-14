# FinancasPro

[English version](README.en.md)

Gerenciador financeiro pessoal com criptografia ponta a ponta. Importa extratos bancarios e faturas de cartao, consolida gastos mensais por categoria e protege tudo com AES-256 — seus dados nunca ficam em texto legivel.

## Screenshots

| Login | Dashboard |
|---|---|
| ![Tela de login](docs/screenshots/login.png) | ![Dashboard com graficos](docs/screenshots/dashboard.png) |

| Importar extrato | Cartao de credito |
|---|---|
| ![Importar extrato com categorizacao automatica](docs/screenshots/import.png) | ![Modulo de cartao de credito](docs/screenshots/credit-card.png) |

## Por que e diferente

- **Privacidade real**: criptografia E2E no cliente. Sem servidor que veja seus dados, sem telemetria, sem analytics. A chave de criptografia so existe em memoria enquanto voce esta logado.
- **Multi-usuario familiar**: cada conta tem senha propria e cofre isolado. Um aparelho, varias pessoas, zero vazamento cruzado.
- **Backup cifrado**: exporta `.financas.enc` protegido por senha; importa com validacao de schema e limite de tamanho.
- **Frase de recuperacao**: 12 palavras que permitem redefinir a senha sem perder dados. Sem dependencia de e-mail ou servidor.
- **Zero custo de infra**: roda 100% no navegador. Pode ser publicado em Cloudflare Pages, GitHub Pages ou qualquer host estatico.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| UI | React 19, TypeScript 6, Tailwind CSS |
| Build | Vite 8 |
| Graficos | Recharts |
| Parsing | PapaParse, pdfjs-dist |
| Criptografia | Web Crypto API (PBKDF2-SHA256, AES-256-GCM) |
| Validacao | Zod |

## Rodando localmente

```bash
npm install
npm run dev
```

Outros comandos: `npm run build`, `npm run lint`, `npm run preview`, `npm run test` (unitarios, Vitest), `npm run test:e2e` (Playwright).

## Funcionalidades

- Importa extratos CSV, OFX e QFX de qualquer banco
- Importa faturas de cartao via CSV ou PDF
- Dashboard mensal: entradas, saidas por tipo, faturas no vencimento, compras abertas
- Composicao de gastos por categoria, tipo e comerciante (com filtros)
- Regras de categorizacao automatica (pattern matching)
- Autenticacao local com rate limit (5 tentativas, bloqueio de 5 min)
- Temas claro/escuro/automatico
- Auto-lock apos 15 minutos de inatividade
- Onboarding guiado para novos usuarios

## Modelo de seguranca

```
Senha do usuario
    |
    v
PBKDF2-SHA256 (310k iteracoes, salt aleatorio)
    |
    +--> authKey --> verifier (hash armazenado, nunca a senha)
    |
    +--> unwrap --> DataKey (AES-256, aleatoria por usuario)
                       |
                       +--> cifra/decifra todo o cofre financeiro
                       +--> zerada em memoria no logout/timeout/reload
```

**Dados em repouso**: `localStorage` contem apenas blobs cifrados e metadados de autenticacao (salt + verifier). Nenhuma descricao de transacao, valor ou nome de cartao fica em texto legivel.

**Backup**: arquivos `.financas.enc` sao cifrados com senha propria via PBKDF2 + AES-GCM. O app aceita tambem JSON legado, com migracao automatica para formato cifrado.

**Recuperacao**:

| Cenario | Resultado |
|---------|-----------|
| Esqueci senha + tenho frase | Nova senha via frase de recuperacao |
| Esqueci senha + tenho backup | Nova conta + importar backup |
| Esqueci senha, frase e backup | Dados perdidos (E2E by design) |

## O que o app nao faz

- Nao e open banking — nao conecta diretamente ao seu banco.
- Nao envia dados a nenhum servidor na fase atual (100% local).
- Nao recupera dados automaticamente por e-mail — isso quebraria o E2E.
- Nao protege contra malware com acesso total ao navegador em execucao.

## Arquitetura

Veja o diagrama completo e o mapa de modulos em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

Pontos de entrada principais:

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/App.tsx` | Shell principal com AuthProvider e AuthGate |
| `src/lib/crypto/crypto.ts` | Primitivas PBKDF2, AES-GCM, wrap/unwrap |
| `src/lib/auth/localAuthProvider.ts` | Multi-usuario local com rate limit |
| `src/utils/secureStorage.ts` | Cofre cifrado namespaced por userId |
| `src/context/FinanceContext.tsx` | Estado central e agregacoes financeiras |
| `src/utils/backup.ts` | Export/import .financas.enc com validacao Zod |
| `src/components/Dashboard.tsx` | Visao analitica mensal |

## Roadmap

### Fase 1 — Base local segura (concluida)

Autenticacao, criptografia E2E, backup cifrado, migracao de dados legados, auto-lock, frase de recuperacao, suite de testes unitarios (Vitest, 157 testes) e E2E (Playwright) com CI no GitHub Actions.

### Fase 2 — Conta com e-mail (proxima)

- `supabaseAuthProvider` para login por e-mail + reset de senha
- Sync de blob cifrado na nuvem (servidor nunca ve JSON de transacoes)
- Tabela `user_vaults` com RLS "so o dono le/escreve"
- Mesmo app em PC, celular e notebook, mesmos dados, zero custo na faixa pessoal

### Fase 3 — Hardening de deploy

- Checklist pre-go-live (HTTPS obrigatorio, sem secrets no repo)
- Documentacao de modelo de ameacas

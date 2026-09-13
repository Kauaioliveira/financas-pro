# FinançasPro

[English version](README.en.md)

Gerenciador financeiro pessoal com criptografia ponta a ponta. Importa extratos bancários e faturas de cartão de crédito, consolida os gastos mensais por categoria e protege tudo com AES-256. Seus dados nunca ficam gravados em texto legível.

## Screenshots

| Login | Dashboard |
|---|---|
| ![Tela de login](docs/screenshots/login.png) | ![Dashboard com gráficos](docs/screenshots/dashboard.png) |

| Importar extrato | Cartão de crédito |
|---|---|
| ![Importar extrato com categorização automática](docs/screenshots/import.png) | ![Módulo de cartão de crédito](docs/screenshots/credit-card.png) |

As capturas são de julho de 2026 e ainda não mostram a importação de fatura nem a densidade atual da interface.

## Por que é diferente

- **Privacidade real**: criptografia E2E no cliente. Nenhum servidor vê seus dados, e não há telemetria nem analytics. A chave de criptografia só existe em memória enquanto você está logado.
- **Multiusuário familiar**: cada conta tem senha própria e cofre isolado. Várias pessoas usam o mesmo aparelho sem ver os dados umas das outras.
- **Backup cifrado**: exporta `.financas.enc` protegido por senha; importa com validação de schema e limite de tamanho.
- **Frase de recuperação**: 12 palavras que permitem redefinir a senha sem perder dados. Sem dependência de e-mail ou servidor.
- **Zero custo de infra**: roda 100% no navegador. Pode ser publicado em Cloudflare Pages, GitHub Pages ou qualquer host estático.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| UI | React 19, TypeScript 6, Tailwind CSS |
| Build | Vite 8 |
| Gráficos | Recharts |
| Parsing | PapaParse, pdfjs-dist |
| Criptografia | Web Crypto API (PBKDF2-SHA256, AES-256-GCM) |
| Validação | Zod |

## Rodando localmente

```bash
npm install
npm run dev
```

Outros comandos: `npm run build`, `npm run lint`, `npm run preview`, `npm run test` (unitários, Vitest), `npm run test:watch` e `npm run test:e2e` (Playwright).

## Funcionalidades

- **Extrato bancário** (aba **Importar Extrato**): CSV, OFX e QFX com um leitor genérico para qualquer banco da lista; PDF com texto selecionável só de Neon e Banrisul.
- **Fatura do cartão de crédito** (aba **Cartão de Crédito** → **Importar fatura**): CSV ou PDF com texto selecionável, com um leitor genérico para qualquer banco. Antes de salvar, a pré-visualização mostra em qual fatura cada compra cai e em que mês o total entra nos gastos.
- **Lançamentos repetidos**: ao importar, o app ignora o que já está salvo e lista o que foi ignorado. Lançamentos idênticos no mesmo arquivo são mantidos.
- **Rascunho entre abas**: a pré-visualização de uma importação continua lá se você trocar de aba. Ela fica só em memória e é descartada ao sair da conta ou recarregar a página.
- Dashboard mensal: entradas, saídas em conta, faturas no mês de vencimento e compras abertas.
- Composição de gastos por categoria, tipo e comerciante (com filtros).
- Regras de categorização automática (por trecho da descrição).
- Autenticação local com rate limit (5 tentativas, bloqueio de 5 min).
- Temas claro, escuro e automático.
- Auto-lock após 15 minutos de inatividade.
- Onboarding guiado para novos usuários.

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
                       +--> zerada em memória no logout/timeout/reload
```

**Dados em repouso**: o `localStorage` contém apenas blobs cifrados e metadados de autenticação (salt + verifier). Nenhuma descrição de transação, valor ou nome de cartão fica em texto legível.

**Backup**: arquivos `.financas.enc` são cifrados com senha própria via PBKDF2 + AES-GCM. O app também aceita JSON legado, com migração automática para o formato cifrado.

**Recuperação**:

| Cenário | Resultado |
|---------|-----------|
| Esqueci a senha e tenho a frase | Nova senha via frase de recuperação |
| Esqueci a senha e tenho backup | Nova conta + importar backup |
| Esqueci senha, frase e backup | Dados perdidos (E2E por design) |

## O que o app não faz

- Não é open banking: não conecta diretamente ao seu banco.
- Não envia dados a nenhum servidor na fase atual (100% local).
- Não recupera dados automaticamente por e-mail, porque isso quebraria o E2E.
- Não protege contra malware com acesso total ao navegador em execução.

## Arquitetura

Veja o diagrama completo e o mapa de módulos em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

Pontos de entrada principais:

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/App.tsx` | Shell principal com AuthProvider e AuthGate |
| `src/lib/crypto/crypto.ts` | Primitivas PBKDF2, AES-GCM, wrap/unwrap |
| `src/lib/auth/localAuthProvider.ts` | Multiusuário local com rate limit |
| `src/utils/secureStorage.ts` | Cofre cifrado com namespace por userId |
| `src/context/FinanceContext.tsx` | Estado central e agregações financeiras |
| `src/utils/backup.ts` | Export/import de .financas.enc com validação Zod |
| `src/components/Dashboard.tsx` | Visão analítica mensal |

## Roadmap

### Fase 1 — Base local segura (concluída)

Autenticação, criptografia E2E, backup cifrado, migração de dados legados, auto-lock, frase de recuperação, suíte de testes unitários (Vitest) e E2E (Playwright) com CI no GitHub Actions.

### Fase 2 — Conta com e-mail (próxima)

- `supabaseAuthProvider` para login por e-mail + reset de senha
- Sync de blob cifrado na nuvem (o servidor nunca vê o JSON das transações)
- Tabela `user_vaults` com RLS "só o dono lê/escreve"
- Mesmo app no PC, no celular e no notebook, com os mesmos dados e custo zero na faixa pessoal

### Fase 3 — Hardening de deploy

- Checklist pré-go-live (HTTPS obrigatório, sem secrets no repo)
- Documentação do modelo de ameaças

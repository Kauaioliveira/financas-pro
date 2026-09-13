# FinancasPro

[Versão em português](README.md)

Personal finance manager with real end-to-end encryption. Imports bank statements and credit card invoices, consolidates monthly spending by category, and protects everything with AES-256. Your data is never stored in readable form.

The app interface is in Brazilian Portuguese; UI labels below are quoted as they appear on screen.

## Screenshots

| Login | Dashboard |
|---|---|
| ![Login screen](docs/screenshots/login.png) | ![Dashboard with charts](docs/screenshots/dashboard.png) |

| Import statement | Credit card |
|---|---|
| ![Statement import with automatic categorization](docs/screenshots/import.png) | ![Credit card module](docs/screenshots/credit-card.png) |

The screenshots are from July 2026 and don't show credit card invoice import or the current UI density yet.

## Why it's different

- **Real privacy**: client-side E2E encryption. No server ever sees your data, no telemetry, no analytics. The encryption key only exists in memory while you're logged in.
- **Multi-user by design**: each account has its own password and isolated vault. Several people can share one device without seeing each other's data.
- **Encrypted backup**: exports a password-protected `.financas.enc` file; imports with schema validation and a size limit.
- **Recovery phrase**: 12 words that let you reset your password without losing data. No dependency on email or a server.
- **Zero infra cost**: runs 100% in the browser. Deployable to Cloudflare Pages, GitHub Pages, or any static host.

## Stack

| Layer | Technology |
|--------|-----------|
| UI | React 19, TypeScript 6, Tailwind CSS |
| Build | Vite 8 |
| Charts | Recharts |
| Parsing | PapaParse, pdfjs-dist |
| Encryption | Web Crypto API (PBKDF2-SHA256, AES-256-GCM) |
| Validation | Zod |

## Running locally

```bash
npm install
npm run dev
```

Other commands: `npm run build`, `npm run lint`, `npm run preview`, `npm run test` (unit tests, Vitest), `npm run test:watch`, and `npm run test:e2e` (Playwright).

## Features

- **Bank statements** (**Importar Extrato** tab): CSV, OFX, and QFX through one generic reader for any bank in the list; text-based PDF only for Neon and Banrisul.
- **Credit card invoices** (**Cartão de Crédito** tab → **Importar fatura**): CSV or text-based PDF through one generic reader for any bank. Before saving, a preview shows which invoice each purchase falls into and the month in which that invoice's total counts as spending.
- **Duplicate detection**: on import, entries already stored are skipped and listed. Identical entries within the same file are kept.
- **Draft kept across tabs**: an import preview survives switching tabs. It lives only in memory and is discarded when you log out or reload the page.
- Monthly dashboard: income, account outflows, invoices in their due month, and open card purchases.
- Spend breakdown by category, type, and merchant (with filters).
- Automatic categorization rules (match on part of the description).
- Local authentication with rate limiting (5 attempts, 5-minute lockout).
- Light/dark/system themes.
- Auto-lock after 15 minutes of inactivity.
- Guided onboarding for new users.

## How the app counts your money

- **A card purchase doesn't count on the day you buy.** It counts as part of the **invoice total**, in the **month the invoice is due**, even if the invoice isn't marked as paid.
- A purchase made **after** the card's closing day goes into the next invoice.
- **Open purchases** (**Compras abertas**) are purchases whose invoice is due after the month you're viewing. They are shown separately and are not part of that month's total.
- In bank statements, entries typed **Crédito** and **invoice payments** are excluded from spending, so the card isn't counted twice.
- **Duplicates**: for statements, date + description + amount + bank; for invoices, card + date + description + amount. The file name is not part of the match.

Full rules, dated examples, and what to do when an entry lands in the wrong place (in Portuguese): [`docs/IMPORTACAO-E-CALCULOS.md`](docs/IMPORTACAO-E-CALCULOS.md).

## Known import limitations

- **A refund on an invoice increases its total**: the negative amount is read as a positive purchase.
- **Interest, charges, and annual fees are not included** in the invoice total. Purchases whose name contains `total`, `juros`, `limite`, or other filtered words are dropped too.
- **An installment printed with the original purchase date** goes into that old month's invoice. It is dropped instead if the date has no year and falls outside the invoice period.
- **Editing a card's closing or due day** doesn't move purchases already imported to a different invoice.
- **Two different purchases** with the same card, date, description, and amount, coming from different files, become one.
- **In bank statements**, a debit purchase described only as "cartão" (without "débito") is typed as Crédito and excluded from spending.
- **Imported card purchases can't be deleted** one by one. The only way to undo is **Resetar dados**, which erases everything.

Details, how to spot each case, and workarounds (in Portuguese): [`docs/IMPORTACAO-E-CALCULOS.md#5-limitações-conhecidas`](docs/IMPORTACAO-E-CALCULOS.md#5-limitações-conhecidas).

Changelog (in Portuguese): [`CHANGELOG.md`](CHANGELOG.md).

## Security model

```
User password
    |
    v
PBKDF2-SHA256 (310k iterations, random salt)
    |
    +--> authKey --> verifier (stored hash, never the password)
    |
    +--> unwrap --> DataKey (AES-256, random per user)
                       |
                       +--> encrypts/decrypts the entire financial vault
                       +--> zeroed in memory on logout/timeout/reload
```

**Data at rest**: `localStorage` only holds encrypted blobs and authentication metadata (salt + verifier). No transaction description, amount, or card name is ever stored in readable text.

**Backup**: `.financas.enc` files are encrypted with their own password via PBKDF2 + AES-GCM. The app also accepts legacy JSON, with automatic migration to the encrypted format.

**Recovery**:

| Scenario | Result |
|---------|-----------|
| Forgot password + have the phrase | New password via recovery phrase |
| Forgot password + have a backup | New account + restore backup |
| Forgot password, phrase, and backup | Data lost (E2E by design) |

## What it doesn't do

- It's not open banking: it doesn't connect directly to your bank.
- It doesn't send data to any server in the current phase (100% local).
- It doesn't recover data automatically via email, because that would break E2E.
- It doesn't protect against malware with full access to the running browser.

## Architecture

See the full diagram and module map in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

Main entry points:

| File | Responsibility |
|---------|-----------------|
| `src/App.tsx` | Main shell with AuthProvider and AuthGate |
| `src/lib/crypto/crypto.ts` | PBKDF2, AES-GCM, wrap/unwrap primitives |
| `src/lib/auth/localAuthProvider.ts` | Local multi-user auth with rate limiting |
| `src/utils/secureStorage.ts` | Encrypted vault namespaced by userId |
| `src/context/FinanceContext.tsx` | Central state and financial aggregations |
| `src/utils/backup.ts` | Export/import of .financas.enc with Zod validation |
| `src/components/Dashboard.tsx` | Monthly analytics view |

## Roadmap

### Phase 1 — Secure local foundation (done)

Authentication, E2E encryption, encrypted backup, legacy data migration, auto-lock, recovery phrase, unit test suite (Vitest) and E2E tests (Playwright) with GitHub Actions CI.

### Phase 2 — Email accounts (next)

- `supabaseAuthProvider` for email login + password reset
- Encrypted blob sync in the cloud (server never sees transaction JSON)
- `user_vaults` table with "owner-only read/write" RLS
- Same app on desktop, phone, and laptop, same data, zero cost at personal scale

### Phase 3 — Deploy hardening

- Pre-go-live checklist (HTTPS required, no secrets in the repo)
- Threat model documentation

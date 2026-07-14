# FinancasPro

[Versao em portugues](README.md)

Personal finance manager with real end-to-end encryption. Imports bank statements and credit card invoices, consolidates monthly spending by category, and protects everything with AES-256 — your data never sits in readable form.

## Screenshots

| Login | Dashboard |
|---|---|
| ![Login screen](docs/screenshots/login.png) | ![Dashboard with charts](docs/screenshots/dashboard.png) |

| Import statement | Credit card |
|---|---|
| ![Statement import with automatic categorization](docs/screenshots/import.png) | ![Credit card module](docs/screenshots/credit-card.png) |

## Why it's different

- **Real privacy**: client-side E2E encryption. No server ever sees your data, no telemetry, no analytics. The encryption key only exists in memory while you're logged in.
- **Multi-user by design**: each account has its own password and isolated vault. One device, several people, zero cross-leakage.
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

Other commands: `npm run build`, `npm run lint`, `npm run preview`, `npm run test` (unit tests, Vitest), `npm run test:e2e` (Playwright).

## Features

- Imports CSV, OFX, and QFX statements from any bank
- Imports credit card invoices via CSV or PDF
- Monthly dashboard: income, expenses by type, upcoming invoices, open card purchases
- Spend breakdown by category, type, and merchant (with filters)
- Automatic categorization rules (pattern matching)
- Local authentication with rate limiting (5 attempts, 5-minute lockout)
- Light/dark/system themes
- Auto-lock after 15 minutes of inactivity
- Guided onboarding for new users

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

- It's not open banking — it doesn't connect directly to your bank.
- It doesn't send data to any server in the current phase (100% local).
- It doesn't recover data automatically via email — that would break E2E.
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

Authentication, E2E encryption, encrypted backup, legacy data migration, auto-lock, recovery phrase, unit test suite (Vitest, 157 tests) and E2E tests (Playwright) with GitHub Actions CI.

### Phase 2 — Email accounts (next)

- `supabaseAuthProvider` for email login + password reset
- Encrypted blob sync in the cloud (server never sees transaction JSON)
- `user_vaults` table with "owner-only read/write" RLS
- Same app on desktop, phone, and laptop, same data, zero cost at personal scale

### Phase 3 — Deploy hardening

- Pre-go-live checklist (HTTPS required, no secrets in the repo)
- Threat model documentation

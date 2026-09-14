# Cloudflare: publicar o site

Publica o FinançasPro como arquivos estáticos na Cloudflare (Workers com static assets), com deploy
automático a cada push na `main`. Faça depois de `docs/deploy/supabase.md` (seções 1 a 7).
Baseado no §9 de `docs/pesquisa/deploy-e-banco-gratis-2026-09-14.md`.

Custo: R$ 0. Nada aqui usa código de servidor: o `wrangler.jsonc` só serve a pasta `dist`.

## O que já está no repositório

| Arquivo | Para quê |
|---|---|
| `wrangler.jsonc` | Worker `financaspro`, só arquivos estáticos, rotas desconhecidas abrem o app |
| `public/_headers` | Cabeçalhos de segurança, incluindo `frame-ancestors 'none'` e HSTS |
| `index.html` | CSP completo; o `connect-src` recebe a URL do Supabase no build |
| `scripts/check-bundle.mjs` | Roda no fim de `npm run build`: falha se houver chave `sb_secret_` ou `service_role` |
| `.env.example` | Lista das variáveis, todas públicas |

## Passo a passo

1. Crie a conta em [dash.cloudflare.com](https://dash.cloudflare.com) e ligue a verificação em duas etapas.
2. **Workers & Pages → Create → Import a repository**:
   - autorize o app da Cloudflare **só** no repositório `financas-pro`;
   - nome do Worker: **`financaspro`** (tem de ser igual ao `name` do `wrangler.jsonc`);
   - Build command: `npm run build`;
   - Deploy command: `npx wrangler deploy`;
   - branch de produção: `main`.
3. **Settings → Build → Variables and secrets** (variáveis de **build**, não de runtime):
   - `VITE_SUPABASE_URL` = Project URL do Supabase;
   - `VITE_SUPABASE_ANON_KEY` = Publishable key (`sb_publishable_...`).
   - **Nunca** coloque a Secret key nem a `service_role`: o build recusa e a guarda falha.
4. Dispare um novo build e anote a URL (ex.: `https://financaspro.<sua-conta>.workers.dev`).
5. No Supabase, **Authentication → URL Configuration**: Site URL = essa URL; inclua-a também em
   Redirect URLs (seção 6 do guia do Supabase).
6. Abra o site e confira:
   - a tela de entrada pede **e-mail** (se pedir só nome e senha, as variáveis não chegaram ao build);
   - DevTools → Network → documento → Response Headers mostra `content-security-policy: frame-ancestors 'none'`
     e `strict-transport-security`;
   - no HTML da página, o `connect-src` contém a URL do seu projeto Supabase.

## Se algo der errado

- **Build falhou com "chave secreta"**: a variável tem uma chave `sb_secret_`/`service_role`. Troque pela
  Publishable key e **revogue** a chave exposta no Supabase (Project Settings → API Keys).
- **Build falhou com "https"**: `VITE_SUPABASE_URL` precisa começar com `https://`.
- **"Refused to connect" no console**: a URL do Supabase do build não é a mesma que o app usa. Refaça o
  build depois de corrigir a variável.
- **Links de e-mail abrem a tela de entrada com "link expirou"**: confira Redirect URLs e abra o link no
  mesmo navegador em que pediu.
- **Voltar ao modo só local no site**: `VITE_FORCE_LOCAL=true` nas variáveis de build. Contas locais
  ficam no navegador de cada pessoa e não sincronizam.

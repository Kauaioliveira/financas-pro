# Cloudflare: publicar o site

Publica o FinançasPro como arquivos estáticos no **Cloudflare Pages**, com deploy automático a cada
push na `main`. Faça depois de `docs/deploy/supabase.md` (seções 1 a 7).

É assim que o projeto está publicado hoje: projeto `financas-pro`, endereço
`https://financas-pro-8hq.pages.dev` (o sufixo `-8hq` é gerado pela Cloudflare; no seu projeto ele
será outro).

Custo: R$ 0. Nada aqui usa código de servidor: a Cloudflare serve a pasta `dist` do build.

## O que já está no repositório

| Arquivo | Para quê |
|---|---|
| `public/_headers` | Cabeçalhos de segurança, incluindo `frame-ancestors 'none'` e HSTS. **Funciona no Pages** (conferido no site publicado) |
| `index.html` | CSP completo; o `connect-src` recebe a URL do Supabase no build |
| `scripts/check-bundle.mjs` | Roda no fim de `npm run build`: falha se houver chave `sb_secret_` ou `service_role` |
| `.env.example` | Lista das variáveis, todas públicas |
| `wrangler.jsonc` | **Não é usado no Pages.** Fica no repositório para quem quiser migrar para Workers (veja o fim deste guia) |

## Passo a passo

1. Crie a conta em [dash.cloudflare.com](https://dash.cloudflare.com) e ligue a verificação em duas etapas.
2. **Workers & Pages → Pages**: conecte o repositório do GitHub.
   - autorize o app da Cloudflare **só** no repositório `financas-pro`;
   - nome do projeto: **`financas-pro`** (ele entra no endereço `.pages.dev`);
   - **Production branch**: `main`;
   - **Build command**: `npm run build` (ele já roda a guarda de bundle no fim);
   - **Build output directory**: `dist`.

   O Pages **não tem deploy command**: depois do build, ele publica o conteúdo de `dist`. O
   `wrangler` não entra em nenhum momento, então não há risco de um deploy quebrar por causa de uma
   versão nova dele.
3. **Environment variables** do projeto, no ambiente de produção (são variáveis de **build**, não de
   runtime):
   - `VITE_SUPABASE_URL` = Project URL do Supabase;
   - `VITE_SUPABASE_ANON_KEY` = Publishable key (`sb_publishable_...`).
   - **Nunca** coloque a Secret key nem a `service_role`: o build recusa e a guarda falha.

   <!-- VERIFICAR: o caminho até as Environment variables dentro das configurações do projeto (qual submenu) não foi conferido no painel; o nome do campo e o ambiente de produção, sim. -->
4. Dispare um novo build e anote a URL (ex.: `https://financas-pro-8hq.pages.dev`).
5. No Supabase, **Authentication → URL Configuration**: Site URL = essa URL; inclua-a também em
   Redirect URLs (seção 6 do guia do Supabase).
6. Confira o site publicado com a lista da próxima seção.

## O que conferir depois do deploy

Tudo abaixo foi **verificado em 24/09/2026** em `https://financas-pro-8hq.pages.dev`. Refaça a
conferência no seu endereço.

- A tela de entrada pede **e-mail**. Se pedir só nome e senha, as variáveis não chegaram ao build.
- No HTML da página, o `connect-src` contém a URL do seu projeto Supabase
  (`connect-src 'self' https://<projeto>.supabase.co`).
- Os cabeçalhos do `public/_headers` chegam na resposta — o Pages aplica o arquivo:
  `strict-transport-security`, `x-content-type-options: nosniff`, `x-frame-options: DENY`,
  `content-security-policy: frame-ancestors 'none'` e `cross-origin-opener-policy: same-origin`.
- `/sw.js` responde com `cache-control: no-cache` e tipo JavaScript. Sem isso, quem já visitou fica
  preso na versão antiga do app.
- `/manifest.webmanifest` responde com `content-type: application/manifest+json`, nome
  **FinançasPro** e os ícones de 192, 512 e o maskable de 512.
- No Supabase: Site URL e Redirect URLs apontando para o endereço publicado, hook da lista do beta
  (`beta_allowlist`) ativo e confirmação de e-mail exigida.

Pelo terminal, os cabeçalhos e o manifesto dão para conferir assim:

```bash
curl -sS -I https://financas-pro-8hq.pages.dev/
curl -sS -I https://financas-pro-8hq.pages.dev/sw.js
curl -sS https://financas-pro-8hq.pages.dev/ | grep -o "connect-src[^;]*;"
```

**Ainda pendente:** o **SMTP do Supabase não está configurado** (seção 5 de
`docs/deploy/supabase.md`). Resolva isso antes de convidar alguém para o beta: os e-mails de
confirmação e de redefinição de senha dependem dele.

## Se um dia você migrar para Workers

O relatório `docs/pesquisa/deploy-e-banco-gratis-2026-09-14.md` (§9) recomendava Workers; a
publicação acabou sendo feita no Pages, e é o Pages que o passo a passo acima descreve.

O caminho por **Cloudflare Workers com static assets** continua possível: o `wrangler.jsonc` na raiz
já descreve o Worker `financaspro`, a pasta `dist` e o `not_found_handling` de aplicação de página
única. O nome do Worker no painel precisa ser igual ao `name` do arquivo.

Diferenças práticas em relação ao Pages:

- no Workers existe um **deploy command** (`npx wrangler deploy`); no Pages, não;
- no Workers o deploy depende do **wrangler**, que não é dependência do repositório: o `npx` baixa a
  versão mais recente a cada deploy. Se um deploy quebrar sem que o código tenha mudado, suspeite de
  uma versão nova e fixe uma (`npx wrangler@<versão> deploy`). No Pages esse risco não existe.

## Se algo der errado

- **Build falhou com "chave secreta"**: a variável tem uma chave `sb_secret_`/`service_role`. Troque pela
  Publishable key e **revogue** a chave exposta no Supabase (Project Settings → API Keys).
- **Build falhou com "https"**: `VITE_SUPABASE_URL` precisa começar com `https://`.
- **"Refused to connect" no console**: a URL do Supabase do build não é a mesma que o app usa. Refaça o
  build depois de corrigir a variável.
- **Links de e-mail abrem a tela de entrada com "link expirou"**: confira Redirect URLs e abra o link no
  mesmo navegador em que pediu.
- **Voltar ao modo só local no site**: `VITE_FORCE_LOCAL=true` nas Environment variables. Contas locais
  ficam no navegador de cada pessoa e não sincronizam.

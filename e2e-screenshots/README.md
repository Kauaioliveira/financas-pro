# Capturas do README

`npm run screenshots` refaz as imagens de `docs/screenshots/` usadas nos dois READMEs.

O roteiro (`capturas.spec.ts`) sobe um build novo do app em modo local e faz o caminho de um
usuário: cadastra a conta de demonstração, confirma as 3 palavras do kit de recuperação, importa o
extrato de exemplo, cadastra o cartão e importa a fatura de exemplo. Se algum desses fluxos
quebrar, o comando falha em vez de gerar uma imagem errada.

| Arquivo | O que é |
|---|---|
| `exemplos/extrato-neon-exemplo.csv` | Extrato de conta de julho a setembro de 2026 |
| `exemplos/fatura-neon-mais-exemplo.csv` | Fatura de cartão de maio a setembro de 2026 |

Os dados são inventados: comerciantes, valores e datas não vêm de extrato nenhum. A conta de
demonstração é criada do zero no navegador do Playwright, e a frase do kit que aparece na captura
morre junto com ele.

O relógio do navegador fica preso em 18/09/2026 para as imagens não mudarem a cada rodada — o app
olha a data de hoje para saber se a fatura já fechou.

Este gerador **não** faz parte da CI nem de `npm run test:e2e`: ele tem config própria
(`playwright.screenshots.config.ts`) e roda sob demanda.

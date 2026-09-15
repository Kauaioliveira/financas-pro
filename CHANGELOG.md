# Changelog

Mudanças relevantes para quem usa o FinançasPro. O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). O projeto ainda não publica versões numeradas.

## [Não lançado]

### Adicionado

- Importação de fatura de cartão de crédito na aba **Cartão de Crédito** → **Importar fatura**. Aceita CSV ou PDF com texto selecionável. O fluxo pede para escolher ou cadastrar o cartão e mostra uma pré-visualização agrupada por fatura, com fechamento, vencimento e o mês em que cada total entra nos gastos. Antes, o leitor de fatura existia no código, mas nenhuma tela o usava.
- A importação de fatura respeita os formatos aceitos por cartão (CSV, PDF ou os dois). Se você trocar de cartão com uma pré-visualização aberta, o arquivo é lido de novo.
- A mensagem de resultado da importação (extrato e fatura) informa quantos lançamentos entraram e quantos foram ignorados por já existirem, com a lista dos ignorados.
- A pré-visualização de uma importação fica em memória ao trocar de aba. Com uma pré-visualização pendente, o navegador pede confirmação antes de fechar ou recarregar a página.
- Erros de leitura mostram um botão com a ação de recuperação (escolher outro arquivo, escolher banco, cadastrar ou editar cartão).
- No extrato, um arquivo enviado antes de escolher o banco é lido assim que o banco é escolhido.
- Guia [`docs/IMPORTACAO-E-CALCULOS.md`](docs/IMPORTACAO-E-CALCULOS.md) explica como o app conta o dinheiro, a regra de repetidos e as limitações conhecidas.

### Alterado

- **Regra de repetidos.** Lançamentos idênticos no mesmo arquivo agora são mantidos: o app compara quantidades, então se o cofre tem 1 e o arquivo traz 2 iguais, entra 1. A descrição passa a ser comparada sem diferenciar maiúsculas e ignorando espaços extras.
- **Regra de repetidos da fatura.** O nome do arquivo deixou de fazer parte da comparação. Reenviar a mesma fatura com outro nome não duplica as compras.
- **Aplicar** (aba **Regras**) passa a recalcular também o tipo dos lançamentos de extrato, não só a categoria.
- Interface mais compacta (escala de espaçamento `--spacing: 0.22rem`). Modais têm altura máxima e rolam em telas baixas.

### Corrigido

- Lançamentos de débito (ex.: `COMPRA CARTAO DEBITO`), boletos com data na descrição (ex.: `BOLETO 01/08`) e entradas de dinheiro (ex.: `CREDITO SALARIO`) eram classificados como Crédito e ficavam fora de todos os totais.
- Um reset de CSS fora de `@layer` zerava todo padding e margin do Tailwind no app inteiro.
- Em telas baixas, a navegação do menu lateral rola em vez de se sobrepor ao topo e ao rodapé do menu.

### Atenção ao atualizar

- **Totais podem mudar.** Com a correção da classificação, lançamentos que antes sumiam passam a contar em **Entradas** ou **Saidas em conta**.
- **Dados já importados mantêm o tipo antigo.** Reimportar o mesmo extrato não corrige, porque as linhas são reconhecidas como repetidas. Para recalcular, abra a aba **Regras** e clique em **Aplicar**. O botão fica desativado quando a lista de regras está vazia; nesse caso, clique antes em **Regras prontas**.
- Veja as [limitações conhecidas da importação de fatura](docs/IMPORTACAO-E-CALCULOS.md#5-limitações-conhecidas) antes de importar: estornos aumentam o total da fatura, e compras importadas não podem ser excluídas individualmente.

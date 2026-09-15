# Importação e cálculos: como o FinançasPro conta o seu dinheiro

Este guia é para quem usa o app e quer entender por que um valor aparece no mês em que aparece. Ele explica como importar extratos e faturas, quais lançamentos o app considera repetidos e onde os números podem sair diferentes do que o banco mostra.

As regras foram conferidas no código-fonte. Quem mantém o projeto encontra, no fim, a tabela [Onde está cada regra](#onde-está-cada-regra).

## Resumo

- **Compra no cartão não conta no dia da compra.** Ela entra nos gastos somada ao total da fatura, no **mês de vencimento** dessa fatura.
- A fatura conta nos gastos do mês de vencimento **mesmo que você não a marque como paga**.
- Compra feita **depois** do dia de fechamento vai para a fatura seguinte. Compra feita **no** dia de fechamento fica na fatura atual.
- **Compras abertas** são as compras cuja fatura vence depois do mês que você está vendo. Elas aparecem separadas e ficam fora do total de gastos do mês.
- No extrato bancário, o **pagamento da fatura** e os lançamentos do tipo **Crédito** ficam fora dos gastos. O cartão já é contado pela fatura, então contar os dois duplicaria o valor.
- Ao importar, o app ignora lançamentos que já estão salvos. Lançamentos idênticos vindos do mesmo arquivo são mantidos.

---

## 1. Compras no cartão de crédito

### Em qual fatura cada compra cai

O app decide pela data da compra e pelos dias de fechamento e vencimento cadastrados no cartão (aba **Cartão de Crédito** → **Novo cartao** ou o lápis de edição).

| Data da compra | Fatura |
|---|---|
| Até o dia de fechamento, inclusive | Fatura que fecha neste mês |
| Depois do dia de fechamento | Fatura que fecha no mês seguinte |

O vencimento é calculado a partir do mês de fechamento:

| Configuração do cartão | Vencimento |
|---|---|
| Dia de vencimento **maior** que o de fechamento (ex.: fecha 3, vence 10) | No mesmo mês do fechamento |
| Dia de vencimento **menor ou igual** ao de fechamento (ex.: fecha 25, vence 5) | No mês seguinte ao fechamento |

Se o dia configurado não existe no mês (por exemplo, dia 31 em abril), o app usa o último dia do mês.

**Exemplo 1**: cartão que fecha no dia 3 e vence no dia 10.

| Compra | Fecha em | Vence em | Entra nos gastos de |
|---|---|---|---|
| 02/09/2026 | 03/09/2026 | 10/09/2026 | setembro de 2026 |
| 03/09/2026 | 03/09/2026 | 10/09/2026 | setembro de 2026 |
| 04/09/2026 | 03/10/2026 | 10/10/2026 | outubro de 2026 |

**Exemplo 2**: cartão que fecha no dia 25 e vence no dia 5.

| Compra | Fecha em | Vence em | Entra nos gastos de |
|---|---|---|---|
| 20/03/2026 | 25/03/2026 | 05/04/2026 | abril de 2026 |
| 26/03/2026 | 25/04/2026 | 05/05/2026 | maio de 2026 |

A pré-visualização da importação mostra essa distribuição antes de salvar. Cada fatura aparece com as datas de fechamento e vencimento, e cada compra aparece com a coluna **Entra nos gastos de**.

### Quando a fatura entra nos gastos

O valor que entra nos gastos do mês é o **total da fatura** que vence naquele mês. O total é a soma das compras importadas para aquela fatura. Não conta o total impresso no PDF do banco (veja [Limitações](#5-limitações-conhecidas)).

Marcar a fatura como paga **não muda** o mês nem o valor dos gastos. Uma fatura que venceu em setembro e não foi marcada como paga continua contando em setembro.

### Compras abertas

Quando você escolhe um mês no Dashboard ou na aba **Cartão de Crédito**, o card **Compras abertas** soma as compras que atendem às duas condições:

1. a fatura da compra vence **depois** do mês escolhido;
2. essa fatura **não** está marcada como paga.

Essas compras não entram em **Faturas no mes** nem no total de gastos do mês escolhido. Elas passam a contar no mês em que a fatura vencer.

Na prática, se você olha o mês atual, **Compras abertas** mostra o ciclo em andamento. Também inclui uma fatura que já fechou mas só vence no mês seguinte.

### O que "Marcar como paga" muda

Na lista **Faturas do ciclo** (aba **Cartão de Crédito**), abra a fatura e clique em **Marcar como paga**. Isso:

- tira as compras dessa fatura de **Compras abertas** e de **Compras em aberto**;
- tira o total dela de **Faturas pendentes**;
- **não** altera os gastos do mês de vencimento.

---

## 2. Extrato bancário

### Como o tipo de cada lançamento é decidido

Ao importar um extrato, o app classifica cada linha pela descrição e pelo sinal do valor. A regra para na primeira condição verdadeira:

| Ordem | Condição (a descrição contém, sem diferenciar maiúsculas) | Tipo |
|---|---|---|
| 1 | `pagamento fatura`, `pagto fatura`, `pgto fatura` ou `pagamento da fatura` | Transferência (e categoria **Pagamento de Fatura**) |
| 2 | `pix` | PIX |
| 3 | Valor **negativo**, descrição sem `debito` e com `cartao`, `credito`, `fatura`, `parcela` ou `parc ` | Crédito |
| 4 | `transferencia`, `ted`, `doc` ou `transf` | Transferência |
| 5 | Qualquer outra | Débito |

Lançamentos de entrada (valor positivo) nunca viram Crédito. Por isso `CREDITO SALARIO` é classificado como Débito e conta como entrada.

### O que entra em cada número

| Número | O que soma |
|---|---|
| **Entradas** | Lançamentos do mês com valor positivo (exceto os do tipo Crédito, que só existem em dados importados antes desta versão) |
| **Saidas em conta** | Lançamentos do mês com valor negativo, tipo Débito, PIX ou Transferência, exceto pagamento de fatura |
| **Faturas no mes** | Total das faturas de cartão que vencem no mês |
| Gastos do mês (gráfico **Entradas vs gastos** e comparação com o mês anterior) | **Saidas em conta** + **Faturas no mes** |
| **Saldo do mes** | **Entradas** − gastos do mês |

### O que fica fora dos gastos e por quê

- **Lançamentos do tipo Crédito.** O app entende que são compras no cartão de crédito, que já são contadas pela fatura.
- **Pagamento da fatura.** Um lançamento fica fora quando a descrição contém um dos textos da linha 1 da tabela acima **ou** quando a categoria é **Pagamento de Fatura**. Pagar a fatura pela conta não soma de novo o que já foi contado pela fatura.

### Se um lançamento caiu no lugar errado

Não dá para editar o tipo ou a categoria de um lançamento na aba **Transações** (lá só é possível excluir). O caminho é criar uma regra:

1. Abra a aba **Regras** e clique em **Nova regra**. Em **Texto para procurar**, coloque um trecho da descrição do lançamento.
2. Para tirar um pagamento de fatura dos gastos (por exemplo, um PIX para o cartão), coloque **Pagamento de Fatura** em **Categoria**. A comparação ignora maiúsculas.
3. Clique em **Salvar**. Você deve ver "Regras salvas no cofre."
4. Clique em **Aplicar**. O app recalcula a categoria de todos os lançamentos e compras já importados, e o **tipo** dos lançamentos de extrato. Você deve ver "Regras salvas e aplicadas nas transações existentes."

Clique em **Salvar** antes de **Aplicar**. Hoje, **Aplicar** usa as regras que já estavam salvas antes do clique. Uma regra nova ou editada só vale no clique seguinte.

> **Dados importados antes desta versão.** Versões anteriores marcavam como Crédito lançamentos de débito, boletos com data na descrição e algumas entradas, que por isso sumiam dos totais. Reimportar o mesmo arquivo não corrige, porque as linhas são reconhecidas como repetidas. Para recalcular os tipos, clique em **Aplicar** na aba **Regras**. O botão fica desativado enquanto não houver pelo menos uma regra. Se você não tem nenhuma, clique em **Regras prontas** (elas já são salvas) e depois em **Aplicar**.

---

## 3. Importar

### Extrato bancário

1. Abra a aba **Importar Extrato**.
2. Em **Selecione o Banco**, clique em **Escolher** e escolha o banco. O último banco usado fica salvo.
3. Arraste o arquivo ou clique para escolher. Formatos aceitos:
   - **CSV, OFX e QFX** de qualquer banco da lista. O leitor é o mesmo para todos, e o banco escolhido só identifica a origem dos lançamentos.
   - **PDF** só de **Neon** e **Banrisul**, com texto selecionável. Para outros bancos aparece a mensagem "PDF bancario ainda nao suportado para <banco>. Use CSV, OFX ou QFX."
4. Confira a **Pré-visualização**. Nada foi salvo ainda.
5. Clique em **Importar**. Você deve ver, por exemplo, "12 transações importadas · 3 já existiam e foram ignoradas."

### Fatura do cartão

1. Abra a aba **Cartão de Crédito** e clique em **Importar fatura**.
2. Em **Cartão da fatura**, escolha o cartão. Se não houver nenhum, clique em **Cadastrar cartão** e informe os dias de fechamento e vencimento. Com um único cartão cadastrado, ele já vem escolhido.
3. Em **Arquivo da fatura**, envie um **CSV** ou um **PDF com texto selecionável**. PDF escaneado ou foto não funciona. O cartão só aceita os formatos marcados no cadastro dele.
4. Confira a **Pré-visualização**. Ela mostra as compras agrupadas por fatura, com fechamento, vencimento e o mês em que cada total entra nos gastos.
5. Clique em **Confirmar importação**. Você deve ver, por exemplo, "25 compras importadas." e "Entram nos gastos de setembro de 2026, pelo total de cada fatura."

Na leitura da fatura, o app **descarta** as linhas cuja descrição contém `pagamento`, `fatura`, `limite`, `saldo anterior`, `total`, `encargos`, `juros` ou `anuidade`.

Erros comuns:

| Mensagem | O que fazer |
|---|---|
| "Esse PDF está protegido por senha…" | Baixe a fatura sem senha no app do banco, ou envie o CSV. |
| "Nenhuma compra encontrada nesse arquivo…" | Todas as linhas lidas caíram no filtro acima ou não tinham data, descrição e valor. Confira se é a fatura do cartão. |
| "Não encontramos compras nesse PDF…" | Confira se é a fatura do cartão (não o extrato) e se o PDF tem texto selecionável. |
| "Esse PDF parece ser o extrato da conta Neon…" | Importe o arquivo na aba **Importar Extrato**. |
| "Não encontramos as colunas de data, descrição e valor nesse CSV…" | Use o CSV exportado pelo banco, sem linhas extras antes do cabeçalho. |
| "Envie a fatura em CSV ou PDF. Arquivos OFX e QFX são de extrato bancário…" | OFX/QFX vão na aba **Importar Extrato**. |
| "O cartão <nome> está configurado para aceitar só …" | Envie no formato aceito ou clique em **Editar cartão** e marque o outro formato. |

### Trocar de aba no meio da importação

A pré-visualização (de extrato ou de fatura) fica guardada **só na memória** enquanto você navega entre as abas. Ela nunca é gravada no navegador em texto legível. Ao voltar para a aba, a importação continua de onde parou.

A pré-visualização é descartada quando você sai da conta ou recarrega a página. Com uma pré-visualização pendente, o navegador pede confirmação antes de fechar ou recarregar a aba.

### Lançamentos repetidos

A cada importação, o app compara o arquivo com o que já está salvo e só adiciona o que é novo.

| Importação | Dois lançamentos são iguais quando têm os mesmos… |
|---|---|
| Extrato bancário | data + descrição + valor + banco |
| Fatura do cartão | cartão + data + descrição + valor |

- A descrição é comparada **sem diferenciar maiúsculas** e **ignorando espaços extras** (`Padaria  Pão` e `PADARIA PÃO` são iguais). Acentos contam: `Pão` e `Pao` são diferentes.
- Na fatura, o **nome do arquivo e o formato não contam**. Reenviar a mesma fatura com outro nome, ou em PDF depois de ter enviado o CSV, não duplica as compras.
- **Lançamentos idênticos no mesmo arquivo são mantidos.** O app compara quantidades: se você já tem 1 café de R$ 8,00 no dia 10 e o arquivo traz 2 iguais, entra 1.
- Reimportar o mesmo arquivo, ou um arquivo com período sobreposto, não duplica nada.

Depois de importar, a mensagem de resultado diz quantos lançamentos foram ignorados. Clique em **Ver as N transações ignoradas** (ou **Ver as N compras ignoradas**) para ver a lista.

---

## 4. Números da aba Cartão de Crédito

| Card | O que soma |
|---|---|
| **Compras em aberto** (topo) | Todas as compras de faturas não marcadas como pagas, de qualquer mês |
| **Faturas pendentes** (topo) | Total de todas as faturas não marcadas como pagas |
| **Fatura do mes** | Total das faturas que vencem no **Mes analisado** |
| **Compras abertas** | Compras cuja fatura vence depois do **Mes analisado** e não está paga |
| **Apos fechamento** | Mesmo valor e mesma contagem de **Compras abertas** |

---

## 5. Limitações conhecidas

### Estorno na fatura aumenta o total

O leitor de fatura (CSV e PDF) transforma todo valor em positivo antes de decidir se a linha é compra. Um estorno ou crédito que não caia nos textos descartados (como `ESTORNO LOJA X -100,00`) entra como **compra de R$ 100,00**. O total fica R$ 200,00 acima do real: soma 100 em vez de subtrair 100. A exceção é `estorno de pagamento`, que é descartado.

**Como perceber:** na pré-visualização, procure linhas com "estorno", "crédito" ou "devolução" na descrição.
**O que fazer:** hoje não há como remover uma compra de cartão depois de importada. Se o estorno já entrou, a única saída é **Resetar dados** (ícone de lixeira no topo), que apaga tudo, e importar de novo. Antes de confirmar a importação, a opção é editar o CSV e tirar a linha do estorno.

### Juros, encargos, anuidade e algumas compras não entram

As linhas com `juros`, `encargos` ou `anuidade` são descartadas. Então o total da fatura no app pode ficar **abaixo** do cobrado pelo banco. O filtro compara pedaços de texto. Por isso também descarta compras reais cujo nome contenha uma dessas palavras: `TOTALPASS` contém `total` e é descartada. IOF não é descartado.

### Compra parcelada com a data original não cai na fatura atual

O app usa a primeira data da linha. Quando a fatura imprime a data da compra original (ex.: `15/06 APPLE PARC 03/10 20,00` numa fatura que vence em setembro), acontece uma de duas coisas:

- **a parcela vai para a fatura antiga.** Com o cartão que fecha no dia 3 e vence no dia 10, ela entra nos gastos de julho, e não de setembro. Isso ocorre quando a data tem ano, ou quando o app não encontrou o período da fatura no arquivo;
- **a parcela é descartada sem aviso.** Isso ocorre quando a data vem sem ano (`15/06`) e o arquivo traz um período (ex.: `04/08/2026 a 03/09/2026`) que não inclui essa data.

Há ainda um terceiro risco. Se o banco não imprimir o número da parcela na descrição, as parcelas de meses seguintes têm cartão, data, descrição e valor iguais aos da primeira. Nesse caso, o app as ignora como repetidas.

**Como perceber:** na pré-visualização, confira se as compras parceladas aparecem e a coluna **Entra nos gastos de** de cada uma.

### Editar fechamento ou vencimento não reorganiza compras já importadas

Cada compra guarda a fatura em que caiu no momento da importação. Se você muda os dias do cartão depois:

- as compras já salvas **continuam na mesma fatura**;
- as datas de fechamento e vencimento dessa fatura passam a usar os dias novos, e o mês em que o total conta pode mudar;
- o mês usado para **Compras abertas** e em "cai em …" (lista **Compras futuras**) continua o calculado com os dias antigos. Por isso os dois números podem ficar desencontrados.

Reimportar o arquivo não corrige, porque as compras são reconhecidas como repetidas. Configure os dias corretos **antes** da primeira importação. Se precisar corrigir, a saída hoje é **Resetar dados** e importar de novo.

A pré-visualização aberta é uma exceção: editar o cartão com ela aberta recalcula as faturas antes de confirmar.

### Duas compras diferentes podem ser tratadas como uma

A regra de repetidos da fatura não considera o arquivo de origem. Duas compras realmente diferentes com mesmo cartão, data, descrição e valor, vindas de **arquivos diferentes**, viram uma só: a do segundo arquivo é ignorada. Dentro de um mesmo arquivo isso não acontece. A lista de compras ignoradas, mostrada depois da importação, permite conferir.

### No extrato, compra no débito descrita como "cartão" some dos gastos

Um lançamento negativo com `cartao`, `credito`, `fatura`, `parcela` ou `parc ` na descrição, sem a palavra `debito`, é classificado como Crédito e fica fora dos gastos. Exemplo: `COMPRA CARTAO MERCADO`. O mesmo vale para um pagamento de fatura escrito de outro jeito que contenha `fatura`.

Um pagamento de fatura feito por PIX (`PIX ENVIADO … FATURA`) é classificado como PIX e **conta** nos gastos, duplicando a fatura. Nos dois casos, corrija com uma regra (veja [Se um lançamento caiu no lugar errado](#se-um-lançamento-caiu-no-lugar-errado)).

### Transferência entre contas próprias vira gasto e entrada

Uma transferência de uma conta sua para outra aparece como gasto (Transferência) no extrato de origem e como entrada no de destino.

### A aba Transações soma diferente do Dashboard

O card **Saidas** da aba **Transações** soma todo valor negativo exceto pagamento de fatura, **incluindo** lançamentos do tipo Crédito. Por isso pode mostrar mais do que **Saidas em conta** no Dashboard.

### Bancos suportados

A lista de bancos tem nove opções: Neon, Mercado Pago, Banrisul, Nubank, Itaú, Bradesco, Santander, Caixa e Banco do Brasil.

| Importação | Formato | Suporte |
|---|---|---|
| Extrato | CSV, OFX, QFX | Leitor genérico, igual para todos os bancos |
| Extrato | PDF | Só Neon e Banrisul, cada um com leitor próprio |
| Fatura | CSV, PDF | Leitor genérico, igual para todos os bancos |

O leitor de fatura procura colunas (CSV) ou linhas (PDF) com data, descrição e valor. Não há leitor específico por banco. Os testes do repositório usam arquivos sintéticos, não faturas reais de nenhum banco. Por isso o resultado depende do layout do arquivo: confira sempre a pré-visualização.

---

## Onde está cada regra

| Regra | Arquivo | Função |
|---|---|---|
| Fatura de cada compra, fechamento e vencimento | `src/utils/credit.ts` | `getCardCycleMonth`, `getInvoiceCloseDate`, `getInvoiceDueDate`, `buildCardPurchase` |
| Status da fatura (aberta, fechada, paga) | `src/utils/credit.ts` | `getInvoiceStatus` |
| Montagem das faturas e total | `src/context/FinanceContext.tsx` | `recalculateInvoices` |
| Faturas do mês | `src/context/FinanceContext.tsx` | `getCardInvoicesByMonth` |
| Compras abertas | `src/context/FinanceContext.tsx` | `getOpenPurchasesForMonth`, `getCardMonthSnapshot` |
| Gastos do extrato no mês | `src/context/FinanceContext.tsx` | `getMonthExpenseTransactions` |
| Entradas, saídas, faturas e total de gastos | `src/context/FinanceContext.tsx` | `getMonthSummary` |
| Tipo do lançamento e pagamento de fatura | `src/utils/categorize.ts` | `categorizeTransaction`, `isInvoicePaymentTransaction` |
| Repetidos | `src/utils/importMerge.ts` | `transactionKey`, `cardPurchaseKey`, `mergeImported` |
| Leitura de fatura (CSV/PDF) e linhas descartadas | `src/utils/parser.ts` | `parseGenericCardCSV`, `parseGenericCardPdf`, `shouldIgnoreCardRow` |
| Leitura de extrato | `src/utils/parser.ts` | `parseBankStatementFile`, `parseCSV`, `parseOFX` |
| Pré-visualização da fatura e mensagens | `src/utils/cardImport.ts`, `src/components/CardStatementImport.tsx` | `groupPurchasesByInvoice`, `describeCardStatementError` |
| Rascunho entre abas | `src/context/ImportDraftContext.tsx` | `ImportDraftProvider` |

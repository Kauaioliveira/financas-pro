# FinançasPro: de MVP a produto de uso mensal

Pesquisa feita em 2026-09-10. Base: leitura do código em `src/` (branch main, com as alterações locais ainda não commitadas), README, ARCHITECTURE, prints em `docs/screenshots/`, a crítica de UX anterior em `.impeccable/critique/2026-07-26T14-17-38Z__src.md` e os sites oficiais dos concorrentes. A busca web ficou fora do ar a sessão inteira, então os dados externos vêm só de páginas oficiais abertas direto pela URL.

---

## Resposta curta

O FinançasPro é um controle financeiro para uma pessoa (ou família no mesmo computador). O usuário importa extratos à mão e o app mostra o mês **pelo regime de caixa**: a compra no cartão só conta como gasto no mês em que a fatura vence. Tudo fica cifrado no navegador, sem servidor. O diferencial real é esse modelo de caixa com o cartão somado à privacidade total e gratuita. Nenhum concorrente brasileiro verificado oferece isso junto.

Antes de pensar em gráficos, o app tem três problemas que fazem os números mostrados estarem errados ou vazios:
1. **Não existe tela para importar a fatura do cartão**, então o módulo que diferencia o produto nunca recebe dados.
2. **A classificação de tipo descarta gastos e salários reais.**
3. **A deduplicação apaga lançamentos legítimos.**

Gráfico novo em cima de número errado piora o produto. A ordem certa é: corrigir os números, ligar o cartão e as parcelas, depois criar os gráficos de futuro (quanto já está comprometido, quanto sobra até o vencimento). Nisso nenhum concorrente olhado aqui se destaca.

---

## 1. O que eu entendi do produto

### Para quem é (inferência minha, a partir do código)
- Uma pessoa física no Brasil que paga quase tudo no cartão e quer saber "quanto do meu mês já foi". O texto do app repete essa ideia: "Cartão só pesa quando vira fatura", "Ciclo real da fatura".
- Alguém que **não quer dar acesso ao banco** para um app de terceiros e aceita exportar o extrato à mão.
- Hoje, na prática, é o próprio desenvolvedor. As regras de categoria embutidas são mercados pessoais: `leka leleka`, `viezzer e cia`, `alsomartsupermerc` e `macromix` aparecem em `src/utils/categorize.ts:83-86` e em `DEFAULT_RULES` (`src/components/CategoryRules.tsx:24-30`). Os únicos PDFs bancários suportados são Neon e Banrisul (`src/utils/parser.ts:852-855`).

### O que ele faz hoje (fato, pelo código)
| Área | Como está hoje |
|---|---|
| Entrada de dados | Extrato bancário em CSV, OFX ou QFX; PDF só de Neon e Banrisul. Um arquivo por vez. Tem que escolher o banco, que precisa estar numa lista de 9 (`src/data/banks.ts`). |
| Categorização | Regex fixa mais regras "texto contém X, então categoria Y" (`categorize.ts`). |
| Transações | Lista com busca, filtros de tipo e mês, e remoção. **Não dá para editar a categoria**: `updateTransaction` existe no contexto, mas nenhum componente o chama. |
| Dashboard | 4 indicadores, **1 gráfico de barras** (entradas vs gastos nos últimos 6 meses), comparação com o mês anterior, e categoria, tipo e top comerciantes como barras de progresso em CSS. |
| Cartão | Cadastro de cartões com dia de fechamento e vencimento, cálculo das faturas por ciclo, fatura do mês vs compras abertas, marcar fatura como paga. |
| Segurança | Criptografia no navegador (PBKDF2 + AES-GCM), vários usuários no mesmo aparelho, backup `.financas.enc`, frase de recuperação de 12 palavras, bloqueio automático após 15 minutos. |

### Qual é o diferencial real
1. **Regime de caixa com o cartão.** A compra entra no mês em que a fatura vence, e o app separa o que já é fatura do que ainda são compras abertas (`FinanceContext.tsx:343-364`, `credit.ts`). A crítica de UX anterior chegou à mesma conclusão: "A distinção fatura-versus-caixa é a única razão pela qual este app merece existir."
2. **Privacidade de verdade e custo zero.** Os concorrentes verificados cobram assinatura e guardam os dados deles no servidor (tabela na seção 4).

O ponto fraco: o diferencial nº 1 **não funciona na prática**, porque não existe tela para importar a fatura (próxima seção).

---

## O que foi apurado

### No código (verificado em 2026-09-10)
- **Não existe tela para importar a fatura do cartão.** `parseCardStatementFile` (`src/utils/parser.ts:862`) e `addCardPurchases` (`FinanceContext.tsx:228`) não são chamados por nenhum componente, nem no commit HEAD. Os únicos `<input type="file">` são o do extrato bancário (`ImportStatement.tsx:228`) e o do backup (`SettingsModal.tsx:432`). A tela do cartão diz "Importe um CSV ou PDF na aba de importação" (`CreditCardView.tsx:257`), mas essa aba só aceita extrato bancário. O print oficial `docs/screenshots/credit-card.png` mostra tudo zerado. O README afirma "Importa faturas de cartão via CSV ou PDF".
- **A classificação de tipo descarta gastos e entradas reais.** As palavras-chave de crédito (`'cartao'`, `'credito'`, `'parcela'`, `'/0'`) são testadas antes das de débito (`categorize.ts:13-16, 37-40`). Rodei a função em descrições reais com Node 24:
  - `COMPRA CARTAO DEBITO SUPERMERCADO X` virou `credito`
  - `Pagamento de boleto 01/08` virou `credito` (o `/0` casa com a data)
  - `PAGTO CONTA LUZ REF 10/05` virou `credito`
  - `CREDITO SALARIO EMPRESA X` virou `credito`
  - `Credito em conta` virou `credito`

  Tudo que é `credito` fica fora dos gastos (`FinanceContext.tsx:318-328`), fora das entradas (`:368-370`) e até da lista de meses (`:463`). Resultado: gastos e salários **somem do painel sem aviso**.
- **A deduplicação apaga lançamentos legítimos.** A chave é `data|descrição|valor|banco` (`FinanceContext.tsx:201-208`): dois cafés de R$ 8 no mesmo dia viram um só. A mensagem de sucesso anuncia `preview.length` sem checar quantos entraram (`ImportStatement.tsx:137-139`). A crítica de 2026-07-26 já tinha apontado isso como P0, e continua igual.
- **As categorias não batem entre si.** A regex automática gera `Alimentacao` e `Saude`, sem acento. A tela de regras oferece `Alimentação` e `Saúde`, com acento (`CategoryRules.tsx:10-22`). Supermercado cai em `Alimentacao` pela regex e em `Mercado` pelas regras prontas. Cada variação vira uma barra separada em "Onde gastei".
- **Tudo que é positivo conta como entrada** (`FinanceContext.tsx:386-388`): estorno, resgate e transferência entre contas próprias. E transferência para conta própria ou aplicação conta como gasto. Não existe o conceito de "transferência interna" nem "ignorar este lançamento".
- **Gráficos existentes:** um único `BarChart` do Recharts (`Dashboard.tsx:319`), sem legenda. Todo o resto são barras CSS com largura mínima de 6% (`Dashboard.tsx:717`, `CreditCardView.tsx:550`), então uma categoria de 1% aparece como 6%. O módulo de cartão não tem nenhum gráfico.
- **Coisas que não existem no código:** orçamento, metas, lançamento manual, recorrência, parcelas, saldo de conta e patrimônio. Busquei `orcamento|budget|meta|goal|recorr|parcel|saldo|previs|forecast`: só apareceram usos incidentais.
- **Testes E2E:** cobrem só o cadastro e o login (`e2e/smoke.spec.ts`).

### Concorrentes (páginas oficiais, vistas em 2026-09-10)
- **Organizze:** "Conecte seus bancos com o Organizze e importe suas finanças com 1 clique"; limite de gastos por categoria; alertas de contas a pagar; faturas de cartões; categorização por IA; integração com ChatGPT, Claude e Manus. Fonte: [organizze.com.br](https://www.organizze.com.br/).
- **Preços do Organizze:**
  - Plano Manual: R$ 35/mês, ou 12x R$ 19,90 no anual (R$ 199,90 à vista), sem conexão bancária.
  - Conectado: R$ 45/mês, ou 12x R$ 39,90, até 3 contas.
  - Conectado Plus: R$ 69/mês, ou 12x R$ 59,90, até 10 contas.

  Fonte: [organizze.com.br/planos](https://www.organizze.com.br/planos).
- **Mobills:** sincronização de contas e cartões, orçamento mensal, metas. Fonte: [mobills.com.br](https://www.mobills.com.br/). Premium a R$ 99,90/ano ("menos de R$ 8,40 por mês"); a página cita sincronização automática para Nubank e Santander. Fonte: [mobills.com.br/pricing](https://www.mobills.com.br/pricing/). Os limites do plano grátis não aparecem na página.
- **Meu Dinheiro:** Open Finance; importação de SMS e push do banco; lembretes de fatura; metas; investimentos. Fonte: [meudinheiroweb.com.br](https://www.meudinheiroweb.com.br/). Planos: Básico grátis por 12 meses, até 100 lançamentos/mês, **sem cartão de crédito**; Pessoal com até 250 lançamentos e cartão; Plus e Família. Recursos em todos os planos: importação de extratos, conciliação, fluxo de caixa, **lançamentos recorrentes**, metas. Preços em reais não aparecem na página. Fonte: [meudinheiroweb.com.br/pessoal/planos](https://www.meudinheiroweb.com.br/pessoal/planos/).
- **Minhas Economias:** "Integre suas contas e cartões, de forma automática ou manual"; orçamentos mensais com alertas; "Gerenciador de Sonhos"; projeções. Preço não aparece na página. Fonte: [minhaseconomias.com.br](https://www.minhaseconomias.com.br/).
- **Referências internacionais:**
  - Actual Budget, que é local-first e de código aberto: relatórios de Cash Flow, Net Worth, Spending Analysis e Calendar; em fase experimental, Balance Forecast e Sankey. Fonte: [actualbudget.org/docs/reports](https://actualbudget.org/docs/reports/).
  - YNAB: relatórios de Net Worth e Spending, metas (targets), US$ 14,99/mês ou US$ 109/ano. Fonte: [ynab.com/features](https://www.ynab.com/features).

---

## 2. O que falta para deixar de ser MVP (em ordem de prioridade)

### Nível 0: os números têm que estar certos (sem isso, nada mais importa)
| # | Item | Por quê |
|---|---|---|
| 0.1 | Criar a tela de importação de fatura: escolher o cartão e depois o arquivo, chamando `parseCardStatementFile` e `addCardPurchases` | O diferencial do produto hoje não recebe dados. |
| 0.2 | Refazer `categorizeTransaction`: usar o sinal do valor e o `TRNTYPE` do OFX; tirar `'/0'`, `'credito'` e `'cartao'` genéricos; testar débito antes de crédito quando aparecer "debito" | Gastos e salários estão sumindo do painel. |
| 0.3 | Deduplicação que devolve `{adicionadas, puladas}` e usa a posição da linha no arquivo para manter repetições legítimas | Dinheiro some em silêncio. |
| 0.4 | Uma lista única de categorias (com acento), sem os mercados pessoais do desenvolvedor | Hoje a mesma categoria aparece partida em barras diferentes. |
| 0.5 | Marcar lançamento como "transferência interna" ou "ignorar" | Entradas infladas, gastos inflados. |

### Nível 1: o que faz a pessoa voltar todo mês
| # | Item | Pergunta que responde | Concorrentes têm? |
|---|---|---|---|
| 1.1 | Editar categoria na própria transação, com a opção "criar regra a partir desta". A aba Regras deixa de existir como item de menu. | "Isso está errado, como conserto?" | Organizze: categorização por IA. |
| 1.2 | **Parcelas:** reconhecer "PARC 03/10" e projetar as parcelas seguintes nas faturas futuras | "Quanto do meu salário dos próximos meses já foi?" | Não encontrei nas páginas lidas que algum concorrente destaque projeção de parcelas (lacuna, não verificado a fundo). |
| 1.3 | Orçamento (limite) por categoria | "Estou no ritmo?" | Organizze, Mobills, Minhas Economias. |
| 1.4 | Lançamento manual e recorrente (aluguel, salário, assinaturas) | "E o que não aparece no extrato?" | Meu Dinheiro, em todos os planos. |
| 1.5 | Aceitar qualquer banco em OFX/CSV genérico ("Outro banco"); importar vários arquivos de uma vez; mostrar a pré-visualização inteira, não só 50 linhas | Hoje o cliente do Inter, C6, PicPay etc. fica bloqueado. | Todos os concorrentes, via Open Finance. |
| 1.6 | Painel "Próximos vencimentos" ao abrir o app, e exportar os vencimentos para a agenda (.ics) | Sem servidor não há notificação push; .ics resolve o lembrete sem servidor (inferência). | Organizze, Meu Dinheiro, Minhas Economias têm alertas. |
| 1.7 | Ritual guiado de "fechar o mês": importar extrato, importar fatura, revisar o que ficou em "Outros", ver o resumo | É o hábito que substitui o Open Finance para quem não quer conectar o banco (inferência). | Não é padrão nos concorrentes. |

### Nível 2: confiança para continuar usando
- **Saldo de conta** (saldo inicial mais o fluxo) e, depois, patrimônio. Hoje o app só vê fluxo, então não consegue dizer "quanto tenho".
- **Lembrete de backup** e aviso claro de que limpar os dados do navegador apaga tudo. Os dados vivem só no `localStorage`.
- **PWA instalável e offline** antes da sincronização com Supabase (Fase 2 do README). É a forma mais barata de ter o app no celular (inferência).
- Os P0 e P1 de acessibilidade e tema da crítica anterior: importação inalcançável pelo teclado; tema claro quebrado; botão principal com contraste de 1,81:1.
- Testes E2E do fluxo principal (importar e ver o painel), não só do login.

### Fica para depois
Investimentos, relatório anual para o IR, multimoeda, Open Finance. Open Finance exige ser participante regulado ou pagar um agregador, o que quebra a proposta "sem servidor" (inferência).

---

## 3. Gráficos e visualizações

### O que existe hoje
| # | Onde | Tipo | Problema |
|---|---|---|---|
| 1 | Dashboard | Barras agrupadas, entradas vs gastos, 6 meses (Recharts) | Sem legenda (a cor é o único jeito de distinguir), sem linha de saldo, sem clique para escolher o mês. |
| 2 | Dashboard e Cartão | Barras de progresso CSS por categoria, tipo e comerciante (top 6) | Largura mínima de 6% distorce as categorias pequenas; não dá para clicar e ver as transações. |
| 3 | Dashboard | Indicadores e comparação com o mês anterior | "Compras abertas" tem o mesmo visual dos gastos, embora seja justamente o que *não* saiu. |
| Nenhum | Cartão | — | O módulo que diferencia o produto não tem nenhuma visualização. |

### O que falta, em ordem de impacto para esse usuário
| Prioridade | Visualização | Pergunta do usuário | Dados que já existem no app | Depende de |
|---|---|---|---|---|
| **1** | **Comprometimento futuro:** barras empilhadas por mês de pagamento (próximos 6–12 meses), uma cor por cartão, parcelas hachuradas | "Quanto do meu salário dos próximos meses já está comprometido?" | `cardInvoices` (`paymentMonth`, `total`, `cardId`), `openPurchases.paymentMonth` | 0.1 (importar fatura); para ficar completo, 1.2 (parcelas) |
| **2** | **Saldo projetado até o fim do mês:** área ou linha diária, com linhas verticais nos vencimentos de fatura (`ComposedChart` + `ReferenceLine`) | "Quanto posso gastar até o dia 17 sem ficar no vermelho?" | `transactions` (datas), `cardInvoices.dueDate` e `total` | Saldo inicial (Nível 2) ou uma versão relativa ao "saldo do mês"; recorrentes (1.4) melhoram |
| **3** | **Linha do tempo do ciclo de cada cartão:** hoje, fechamento, vencimento, "melhor dia de compra" | "Se eu comprar hoje, quando pago?" | `CardAccount.closingDay`, `dueDay`, `getInvoiceDueDate` | Nada. Dá para fazer em SVG ou CSS, sem biblioteca de gráfico. |
| **4** | **Gasto acumulado no mês vs média dos 3 meses anteriores:** linha cumulativa diária; a fatura aparece como um degrau no dia do vencimento | "Estou gastando mais rápido que o normal?" | `transactions`, `getCardInvoicesByMonth` | 0.2 (senão a curva fica errada) |
| **5** | **Orçado vs realizado por categoria:** barra com marcador do "ritmo esperado" (dia do mês dividido pelo número de dias) | "Em que categoria estou estourando?" | `getMonthExpenseBreakdown` | 1.3 (orçamento) |
| **6** | **Categorias ao longo do tempo:** barras empilhadas mensais (top 5 + Outros) ou minigráficos por categoria | "Qual categoria está crescendo?" | `getMonthExpenseBreakdown` e `getCardExpenseBreakdown` mês a mês | 0.4 (categorias únicas) |
| 7 | **Melhorar o gráfico que já existe:** legenda, linha de saldo, 12 meses, clique no mês | "Fechei no azul ou no vermelho, e qual é a tendência?" | `getMonthSummary` | Nada. É o ganho mais rápido. |
| 8 | Clicar numa barra de categoria ou comerciante e ver a lista de transações dela | "O que é esse 'Outros' de R$ 900?" | `transactions`, `cardPurchases` | Nada |
| 9 | Assinaturas detectadas (mesmo comerciante e valor parecido todo mês) com o total por mês | "Quanto pago de assinaturas?" | Descrição e valor mês a mês | Heurística nova |
| 10 | Calendário de gastos por dia (heatmap) | "Em que dias eu gasto mais?" | `transactions.date` | Nada. Prioridade baixa. |
| 11 | Sankey de entradas para categorias | "Para onde vai o salário?" | Resumo do mês | Baixa: bonito, mas pouco usado. O Actual Budget ainda o mantém como experimental. |

**Evitar:** pizza e donut para categorias. As barras horizontais que já existem comparam melhor; o melhor investimento é deixá-las fiéis (sem o mínimo de 6%) e clicáveis.

**Quais pesam mais:** os itens 1, 2 e 3 são os únicos que **desenham o diferencial**, porque falam do futuro do caixa. Os concorrentes vendem o retrato do passado ("relatórios", "resumos com gráficos"). Os itens 7 e 8 são ganhos rápidos. Os itens 4 a 6 são o que o usuário espera de qualquer app do tipo.

---

## 4. Comparação com os apps usados no Brasil

| Critério | FinançasPro | Organizze | Mobills | Meu Dinheiro | Minhas Economias |
|---|---|---|---|---|---|
| Preço | Grátis | R$ 19,90–59,90/mês no anual | R$ 99,90/ano (Premium) | Básico grátis por 12 meses; preço dos outros planos não visto | Não visto |
| Conexão com o banco (Open Finance) | Não; importação manual | Sim (Conectado, até 3 ou 10 contas) | Sincronização (a página cita Nubank e Santander) | Sim, e também SMS e push | Sim, "automática ou manual" |
| Cartão e faturas | Modelo mais correto (regime de caixa), **mas sem tela de importação** | Sim | Sim | Só nos planos pagos | Sim (contas e cartões) |
| Orçamento por categoria | Não | Sim | Sim | Não confirmado | Sim, com alertas |
| Metas | Não | Não confirmado | Sim | Sim | Sim ("Sonhos") |
| Recorrentes | Não | Não confirmado | Não confirmado | Sim | Não confirmado |
| Alertas de vencimento | Não | Sim | Não confirmado | Sim | Sim |
| Celular | Só navegador | App | App | App | App |
| Onde ficam os dados | **Só no seu navegador, cifrados** | Servidor do fornecedor | Servidor do fornecedor | Servidor do fornecedor | Servidor do fornecedor |
| Projeção de parcelas e comprometimento futuro | Não (ainda) | Não visto | Não visto | "Fluxo de caixa" (sem detalhes) | "Projeções" (sem detalhes) |

"Não confirmado" ou "não visto" = não apareceu na página oficial que abri; não quer dizer que o recurso não existe.

**O que é esperado (o mínimo da categoria):** cartão com faturas, orçamento por categoria, alertas de vencimento, relatórios com gráficos e app no celular. O FinançasPro tem só um desses de verdade, e mesmo esse está sem importação.

**Onde dá para se diferenciar:**
1. **Privacidade como produto.** Todos os concorrentes pedem acesso ao banco e guardam os dados no servidor deles. "Seu extrato nunca sai do seu computador" é uma promessa que eles não conseguem fazer.
2. **Futuro do caixa com cartão e parcelado.** Comprometimento futuro, saldo até o vencimento, melhor dia de compra. Em vez de competir com um relatório do passado, o app responde "quanto posso gastar".
3. **Custo zero.** O Organizze cobra de R$ 199,90 a R$ 599,90 por ano.

**Onde não vale competir:** Open Finance e conexão automática. Isso exige infraestrutura regulada ou um agregador pago e anula a tese do app (inferência).

---

## Recomendação

O que eu faria, nesta ordem:
1. **Uma rodada de correção dos números (Nível 0 inteiro).** São mudanças pequenas e localizadas: `categorize.ts`, `FinanceContext.tsx`, `ImportStatement.tsx`, e ligar o importador de fatura que já existe. Cada correção precisa de um teste com as descrições listadas acima.
2. **Parcelas mais o gráfico de comprometimento futuro (gráfico nº 1) mais a linha do tempo do ciclo (nº 3).** É o que transforma "o app explica em parágrafo" em "o app mostra", e é o que nenhum concorrente verificado vende.
3. **Editar a categoria na transação, orçamento por categoria e o gráfico de orçado vs realizado.** É o mínimo que o usuário espera da categoria.
4. **Ritual de fechar o mês, lembrete de backup e PWA.** É o que cria o hábito mensal sem precisar de servidor.
5. Só então a Fase 2 (sincronização na nuvem).

**Principal risco:** o atrito da importação manual. Quem compara com o Organizze ou o Mobills conectados pode desistir no segundo mês. O remédio é tornar o ritual mensal curto (vários arquivos por vez, qualquer banco, revisão só do que ficou em "Outros") e deixar explícito para quem o produto é: quem não quer conectar o banco. Se o dono quiser atingir o público geral, a proposta sem servidor vira limitação, e essa é uma decisão de produto, não técnica.

---

## Confiança e lacunas

**Alta** para tudo o que foi dito sobre o código. Li os arquivos e rodei `categorizeTransaction` e `guessCategory` com Node 24.

**Média** para a comparação com os concorrentes. Vem só das páginas oficiais (marketing), sem uso real dos apps, e a busca web estava fora do ar.

**Sem resposta:**
- Números de adoção do Open Finance no Brasil: o painel público não carregou o conteúdo e o site deu 403.
- Preços do Meu Dinheiro e do Minhas Economias, e os limites do plano grátis do Mobills.
- Se algum concorrente projeta parcelas futuras.
- O que os apps dos próprios bancos (Nubank, Inter) oferecem de controle de gastos. Na prática são o maior concorrente, porque o usuário já está lá.
- Reclamações de usuários (Reclame Aqui, lojas de apps): não foi possível buscar.

**O que resolveria:** repetir a busca com a web disponível; instalar o Organizze e o Mobills no plano grátis e testar cartão e parcelas; conversar com 3 a 5 pessoas do público-alvo sobre o ritual mensal.

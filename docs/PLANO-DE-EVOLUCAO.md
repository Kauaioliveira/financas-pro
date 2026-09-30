# Plano de evolução: do painel de gastos às finanças pessoais completas

Hoje o FinançasPro responde bem a **"para onde foi o meu dinheiro?"**: importa extrato e fatura,
põe o cartão no mês certo, separa por categoria e, desde esta versão, mostra a evolução por
categoria e uma **projeção dos próximos 3 meses**. O que ainda falta é responder
**"para onde o meu dinheiro deveria ir?"** — orçamento, metas e compromissos futuros.

A ordem abaixo segue um critério: cada etapa usa os dados que o app já tem e deixa o próximo passo
mais útil. Tudo continua cifrado de ponta a ponta, como hoje.

## Etapa 1 — Planejar o mês (próximo passo)

| Recurso | O que resolve | Base que já existe |
|---|---|---|
| **Orçamento por categoria** | Definir um teto para Alimentação, Lazer etc. e ver no painel quanto já foi usado, com aviso ao passar de 80% e de 100%. | Categorias, regras e a composição do mês. |
| **Orçamento sugerido** | Propor o teto de cada categoria a partir da média dos últimos meses, para ninguém começar do zero. | A mesma média ponderada da projeção (`src/utils/projection.ts`). |
| **Contas fixas e assinaturas** | Detectar o que se repete todo mês (aluguel, condomínio, streaming) e listar com dia e valor. | Descrições e valores dos extratos importados. |
| **Saldo previsto do mês** | Entradas esperadas menos contas fixas, faturas já conhecidas e projeção do resto. | Projeção de gastos e faturas futuras. |

## Etapa 2 — Metas e reserva

- **Metas com prazo** (reserva de emergência, viagem, entrada de um imóvel): valor, data e quanto
  guardar por mês para chegar lá, recalculado com o que sobrou de verdade em cada mês.
- **Reserva de emergência**: meta pronta, sugerida como 6 meses da média de gastos.
- **Simulador "e se"**: cortar X de uma categoria ou assumir uma parcela nova e ver o efeito na
  projeção e nas metas antes de decidir.

## Etapa 3 — Visão do patrimônio

- **Contas e saldos**: mais de uma conta, cada uma com saldo, em vez de só movimentos.
- **Investimentos e dívidas** lançados à mão (sem conectar em corretora): patrimônio líquido mês a mês.
- **Parcelamentos e financiamentos**: quanto falta pagar e quando cada um termina — hoje as parcelas
  aparecem só como compras soltas na fatura.

## Etapa 4 — Hábito e confiabilidade

- **Lembretes de vencimento** pelo PWA (notificação no celular antes da fatura vencer).
- **Resumo do mês** ao virar o mês: o que saiu do orçamento, a maior variação e o avanço das metas.
- **Corrigir as limitações conhecidas da importação** que distorcem os gráficos: estorno que soma
  na fatura e compra de cartão que não pode ser excluída sozinha
  ([`IMPORTACAO-E-CALCULOS.md`](IMPORTACAO-E-CALCULOS.md#5-limitações-conhecidas)).
- **Relatório anual** para o Imposto de Renda (gastos de saúde e educação por ano).

## O que fica de fora de propósito

- **Open Finance (conexão direta com o banco)**: exigiria um servidor com acesso aos dados em
  texto legível, o que quebra a promessa central do app. Fica como decisão consciente, não como
  pendência.

## Por onde começar

A recomendação é começar pelo **orçamento por categoria com sugestão automática**: é o que
transforma os gráficos novos em decisão, e todos os dados que ele precisa já estão no cofre.

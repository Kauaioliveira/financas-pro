# Changelog

Mudanças relevantes para quem usa o FinançasPro. O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). O projeto ainda não publica versões numeradas.

## [Não lançado]

### Adicionado

- **Kit de recuperação renovável.** Em **Configurações → Kit de recuperação → Gerar kit novo**, o app pede a senha da conta, mostra uma folha imprimível com id curto e data, pede **3 palavras sorteadas** e só então gira a chave dos dados e grava. O kit anterior deixa de abrir a conta.
- **Folha imprimível do kit**, com id, data, as 12 palavras numeradas e instruções de uso, no cadastro e a cada kit novo.
- **Modo nuvem opcional** (Supabase + Cloudflare), ligado por `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`: conta por e-mail com confirmação, cofre cifrado na nuvem, sincronização entre aparelhos, **Esqueci a senha** e **Abrir dados com o kit**. Sem essas variáveis, o app continua 100% local e o código de nuvem nem entra no arquivo publicado.
- **Selo de sincronização** no topo (**Sincronizado**, **Sincronizando...**, **Sem sincronizar**).
- **Fusão automática entre aparelhos**: quando dois aparelhos editam ao mesmo tempo, o app junta as alterações por registro e avisa quantos conflitos houve (nesses, fica a versão deste aparelho). O diálogo de escolha continua para o que a fusão não resolve.
- **Política de privacidade e termos do beta** dentro do app, em português simples: o que o servidor guarda, onde ficam os dados, a transferência internacional, prazos, direitos e como pedir a exclusão. Abrem pelo rodapé do login, por Configurações ou pelos endereços `#/privacidade` e `#/termos`.
- **Consentimento no cadastro da nuvem**: duas caixas separadas e desmarcadas (documentos e transferência internacional). Sem as duas, o botão de criar conta fica desabilitado. A data e a versão do texto aceito ficam gravadas junto da conta.
- **Dar opinião dentro do app** (só no modo nuvem): botão no topo, tipo (defeito, ideia, elogio, outro), mensagem de até 2.000 caracteres com contador, e envio automático do nome da tela e da versão do app. Nenhum dado financeiro é enviado.
- **Beta fechado por lista de e-mails**: quem não está na tabela `beta_allowlist` não consegue criar conta.
- **Tela de erro quando o cofre não abre**, com **Tentar de novo**, **Sair da conta** e **Restaurar backup**. Antes de restaurar, o app guarda no navegador uma cópia dos dados que não abriram.
- **Aviso fixo quando uma gravação falha** (armazenamento cheio, por exemplo), com a opção de tentar de novo. Os dados pendentes continuam na fila em vez de serem descartados.
- **Banco de dados versionado**: `supabase/migrations/0001_init.sql` (tabelas, políticas e funções) e `supabase/tests/0001_init_check.sql` para conferir o esquema num projeto de teste.
- **Guias de publicação**: [`docs/deploy/supabase.md`](docs/deploy/supabase.md) e [`docs/deploy/cloudflare.md`](docs/deploy/cloudflare.md).
- **Guia de recuperação de conta para quem usa o app**: [`docs/RECUPERACAO-DE-CONTA.md`](docs/RECUPERACAO-DE-CONTA.md).
- **Guarda de bundle** (`npm run check:bundle`): o build falha se uma chave secreta do Supabase (`sb_secret_...` ou `service_role`) aparecer no site, e a CI ainda exige que o build local não contenha código de nuvem.
- Cabeçalhos de segurança (`public/_headers`), CSP montada no build com a origem do Supabase, `wrangler.jsonc` e `.env.example`.
- Importação de fatura de cartão de crédito na aba **Cartão de Crédito** → **Importar fatura**. Aceita CSV ou PDF com texto selecionável. O fluxo pede para escolher ou cadastrar o cartão e mostra uma pré-visualização agrupada por fatura, com fechamento, vencimento e o mês em que cada total entra nos gastos. Antes, o leitor de fatura existia no código, mas nenhuma tela o usava.
- A importação de fatura respeita os formatos aceitos por cartão (CSV, PDF ou os dois). Se você trocar de cartão com uma pré-visualização aberta, o arquivo é lido de novo.
- A mensagem de resultado da importação (extrato e fatura) informa quantos lançamentos entraram e quantos foram ignorados por já existirem, com a lista dos ignorados.
- A pré-visualização de uma importação fica em memória ao trocar de aba. Com uma pré-visualização pendente, o navegador pede confirmação antes de fechar ou recarregar a página.
- Erros de leitura mostram um botão com a ação de recuperação (escolher outro arquivo, escolher banco, cadastrar ou editar cartão).
- No extrato, um arquivo enviado antes de escolher o banco é lido assim que o banco é escolhido.
- Guia [`docs/IMPORTACAO-E-CALCULOS.md`](docs/IMPORTACAO-E-CALCULOS.md) explica como o app conta o dinheiro, a regra de repetidos e as limitações conhecidas.

### Alterado

- **Backup (formato v2).** O arquivo exportado passa a abrir com **o kit de recuperação ou com a senha da conta**, as duas coisas como estavam no dia da exportação. **A senha separada de backup deixou de existir**: o app não pede mais uma senha na exportação. Backups antigos (v1) continuam abrindo com a senha própria deles, e o JSON legado continua sendo aceito.
- **Cadastro pede 3 palavras do kit** em vez da caixa "eu anotei". O kit também passou a ter id curto e data.
- **O cofre nunca é sobrescrito quando não abre.** Antes, uma falha de leitura podia ser tratada como cofre vazio; agora ela vira um erro tipado e uma tela de erro.
- **Nada é gravado com uma chave velha.** Depois de uma troca de senha ou de kit (nesta aba ou em outra), a gravação antiga é recusada e os dados esperam a sessão nova.
- Contas na nuvem exigem senha de **pelo menos 12 caracteres**, recusam senhas comuns e senhas que contenham o e-mail. Contas locais seguem com o mínimo de 6.
- **Regra de repetidos.** Lançamentos idênticos no mesmo arquivo agora são mantidos: o app compara quantidades, então se o cofre tem 1 e o arquivo traz 2 iguais, entra 1. A descrição passa a ser comparada sem diferenciar maiúsculas e ignorando espaços extras.
- **Regra de repetidos da fatura.** O nome do arquivo deixou de fazer parte da comparação. Reenviar a mesma fatura com outro nome não duplica as compras.
- **Aplicar** (aba **Regras**) passa a recalcular também o tipo dos lançamentos de extrato, não só a categoria.
- Interface mais compacta (escala de espaçamento `--spacing: 0.22rem`). Modais têm altura máxima e rolam em telas baixas.

### Corrigido

- Lançamentos de débito (ex.: `COMPRA CARTAO DEBITO`), boletos com data na descrição (ex.: `BOLETO 01/08`) e entradas de dinheiro (ex.: `CREDITO SALARIO`) eram classificados como Crédito e ficavam fora de todos os totais.
- Um reset de CSS fora de `@layer` zerava todo padding e margin do Tailwind no app inteiro.
- Em telas baixas, a navegação do menu lateral rola em vez de se sobrepor ao topo e ao rodapé do menu.

### Atenção ao atualizar

- **O backup mudou de formato.** A exportação não pede mais uma senha: o arquivo novo abre com **o kit de recuperação ou com a senha que a conta tinha no dia da exportação**. Ao restaurar, o app pergunta qual das duas você vai usar. **Backups v1 antigos continuam válidos** e continuam abrindo com a senha de backup que você escolheu na época.
- **Gerar um kit novo invalida o anterior de verdade.** A operação gira a chave dos dados: depois de confirmada, o kit antigo não abre mais a conta. Ele ainda abre os **backups exportados antes** da troca. Guarde a folha nova e destrua a antiga só depois de conferir os backups que quiser manter.
- **Contas locais existentes continuam abrindo sem nenhuma migração.** Nada a fazer: o formato do cofre e da conta no navegador não mudou.
- **O modo nuvem é opcional e não liga sozinho.** Sem `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, nada muda no seu uso: os dados continuam só no seu navegador.
- **No modo nuvem, o link de "Esqueci a senha" só funciona no navegador em que você o pediu**, e **trocar o e-mail da conta quebra o login** (o salt da senha deriva do e-mail).
- **Totais podem mudar.** Com a correção da classificação, lançamentos que antes sumiam passam a contar em **Entradas** ou **Saidas em conta**.
- **Dados já importados mantêm o tipo antigo.** Reimportar o mesmo extrato não corrige, porque as linhas são reconhecidas como repetidas. Para recalcular, abra a aba **Regras** e clique em **Aplicar**. O botão fica desativado quando a lista de regras está vazia; nesse caso, clique antes em **Regras prontas**.
- Veja as [limitações conhecidas da importação de fatura](docs/IMPORTACAO-E-CALCULOS.md#5-limitações-conhecidas) antes de importar: estornos aumentam o total da fatura, e compras importadas não podem ser excluídas individualmente.

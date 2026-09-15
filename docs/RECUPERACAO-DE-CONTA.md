# Recuperação de conta: o que você recupera com o que tem

Este guia é para quem usa o FinançasPro. Ele responde uma pergunta: **se eu perder alguma
coisa, o que volta?**

A regra que explica todas as respostas:

> **O e-mail devolve o acesso à conta. Só o kit de recuperação abre os dados.**

Redefinir a senha por e-mail faz você entrar de novo, mas os seus lançamentos continuam
cifrados com a chave anterior. Quem devolve essa chave é o kit — as 12 palavras — ou um
backup.

No **modo local** (sem conta por e-mail) não existe redefinição por e-mail: o kit e os
backups são as únicas saídas.

## O kit de recuperação

- São **12 palavras em português, na ordem**, mais um **id curto** (6 caracteres, ex.: `a1b2c3`)
  que serve só para você saber qual kit é qual.
- Ele guarda uma cópia da chave que abre os seus dados, embrulhada nas 12 palavras.
- Ele aparece **uma vez**: no cadastro (modo local) ou em **Configurar cofre** (modo nuvem).
  Depois disso o app não mostra as palavras de novo — ele não as guarda.
- As palavras da lista são escritas **sem acento** (`leao`, `lapis`, `abraco`). Digite-as
  exatamente como estão na folha, na mesma ordem. Maiúsculas não importam.
- Acentos digitados por engano são ignorados ao abrir os dados no modo nuvem e ao restaurar um
  backup, mas **não** na tela **Esqueci minha senha** do modo local: ali, `leão` não abre.
- As mesmas 12 palavras também abrem os backups `.financas.enc` exportados enquanto aquele
  kit estava ativo.

## Modo nuvem (conta com e-mail)

| O que você tem | O que você recupera |
|---|---|
| E-mail **e** senha | Tudo: entra e vê os dados nos seus aparelhos. |
| A senha, mas perdeu o acesso à caixa de e-mail | Tudo, enquanto lembrar a senha: o login continua funcionando. O e-mail só é usado para confirmar o cadastro e para redefinir a senha — sem ele, um esquecimento de senha vira o caso da linha de baixo. |
| O e-mail, não a senha, **com** o kit | A conta **e** os dados. "Esqueci a senha" → link no e-mail → senha nova → **Abrir dados com o kit** → digitar as 12 palavras. |
| O e-mail, não a senha, **sem** o kit | Só o acesso à conta. Os dados continuam cifrados. Restam: **Restaurar de um backup**, **Lembrei a senha antiga** (se ela voltar à memória) ou **Começar do zero**, que deixa os dados antigos cifrados para sempre. |
| Nada disso (nem e-mail, nem senha, nem kit, nem backup) | Nada. Ninguém no projeto tem a sua chave — o servidor guarda só texto cifrado. |

Depois de digitar o kit, o app volta a embrulhar a sua chave com a senha nova: nas próximas
vezes, entrar com e-mail e senha basta.

### "Este kit abre uma versão antiga"

Se você usar um kit **antigo** (porque gerou um kit novo depois), o app avisa que aquele kit
só abre uma cópia guardada em outra data, mostra a data e pede confirmação antes de
restaurá-la. Cancele e use o kit mais novo, se você o tiver.

## Modo local (só neste navegador)

| O que você tem | O que você recupera |
|---|---|
| A senha da conta | Tudo. |
| O kit, não a senha | Tudo: **Esqueci minha senha** na tela de entrada → 12 palavras → senha nova. |
| Um backup `.financas.enc` e o kit **ou** a senha da época do backup | Os dados que estavam no backup, restaurados em Configurações → **Restaurar backup**. |
| Nem senha, nem kit, nem backup | Nada. Os dados ficam no navegador, cifrados e sem chave. |

Contas locais vivem no navegador daquele computador. Limpar os dados do navegador, trocar de
máquina ou usar uma janela anônima faz a conta desaparecer dali — **o backup é o que atravessa
esses limites**.

## Como imprimir e guardar o kit

1. Na tela que mostra as 12 palavras, clique em **Imprimir kit**. A folha sai com o id, a data,
   as palavras numeradas e as instruções de uso.
2. Se preferir papel escrito à mão, copie na ordem e **confira palavra por palavra**. O app
   pede 3 palavras sorteadas em seguida justamente para pegar erro de cópia.
3. Guarde em lugar físico e fechado (gaveta com chave, pasta de documentos, cofre). Quem tiver
   as palavras **e** acesso à sua conta ou a um backup consegue ver os seus dados.
4. Duas cópias em lugares diferentes protegem contra perda, incêndio e mudança.
5. Não guarde as palavras no mesmo computador em que usa o app: um arquivo de texto ou uma foto
   no celular anula a proteção. Um gerenciador de senhas é uma alternativa aceitável, desde que
   ele não use a mesma senha da conta.

O app **não** pede as palavras no dia a dia. Só no caso de recuperação.

## Quando gerar um kit novo

Vá em **Configurações → Kit de recuperação → Gerar kit novo** quando:

- o papel se perdeu, rasgou, molhou ou você não tem certeza de ter copiado certo;
- alguém pode ter visto as palavras (foto, print, papel esquecido, computador compartilhado);
- você guardou o kit num lugar que deixou de ser seguro.

O que acontece quando você confirma:

1. O app pede a **senha da conta**.
2. Mostra o kit novo, com id e data, e o botão de imprimir.
3. Pede **3 palavras sorteadas** do kit novo.
4. Só então **gira a chave dos dados**: o cofre é recifrado com uma chave nova e o kit novo é
   gravado.

Consequências, todas verdadeiras:

- **O kit anterior deixa de abrir a conta.** Não é um aviso de tela: a chave antiga foi trocada.
- **Backups exportados antes continuam abrindo** com o kit e a senha que existiam na época deles.
- **No modo nuvem, gerar kit novo precisa de internet.** Sem conexão, nada é alterado.
- Se algo falhar no meio (senha errada, cofre que não abre, conflito com outro aparelho), o app
  não troca nada e diz o motivo.

## Backup: a segunda rede de proteção

Em **Configurações → Backup cifrado → Exportar backup** o app baixa um arquivo
`financaspro-backup-AAAA-MM-DD.financas.enc`.

- Ele **abre com o kit de recuperação ou com a senha da conta**, as duas coisas como estavam
  **no dia da exportação**.
- **Não existe mais uma senha separada só do backup.** Arquivos exportados nas versões antigas
  do app continuam abrindo com aquela senha antiga: o app reconhece o formato e pergunta.
- Trocar a senha ou gerar um kit novo depois **não muda** um backup já exportado.
- Exporte um backup antes de mexer em senha, kit ou **Resetar dados**.

## Avisos honestos

- O link de **"Esqueci a senha"** só funciona **no mesmo navegador** em que você pediu. Se abrir
  o e-mail no celular e o pedido saiu do computador, o link falha: peça outro no aparelho em que
  vai usar.
- **Não troque o e-mail da conta.** O "sal" que protege a sua senha é derivado do e-mail: mudar
  o endereço faz a senha parar de funcionar. O app não oferece essa troca.
- Ninguém do projeto consegue abrir os seus dados nem devolvê-los. Não existe atendimento que
  resolva a perda do kit.

/**
 * Privacy policy and beta terms shown inside the app (docs §8), in plain Portuguese.
 *
 * The text lives here, not in the component, so the same words can be checked by tests
 * and referenced by the consent recorded with the account (LEGAL_VERSION).
 *
 * WARNING: this is not a legal opinion. What depends on the owner (who the controller is
 * and which e-mail answers requests) is marked with PLACEHOLDER_MARK and shows a visible
 * warning in the app until it is filled in.
 */

import { LEGAL_TITLES } from './routes';
import type { LegalRoute } from './routes';

export type { LegalRoute };

/** Version recorded with the account when someone accepts. Bump it when the text changes. */
export const LEGAL_VERSION = '2026-09-15';

export const PLACEHOLDER_MARK = 'o dono precisa preencher';

/** TODO(dono): nome de quem responde pelos dados (pessoa ou empresa). */
export const CONTROLLER_NAME = `[NOME DE QUEM RESPONDE PELOS DADOS — ${PLACEHOLDER_MARK}]`;
/** TODO(dono): endereço que recebe pedidos de acesso, correção e exclusão. */
export const CONTACT_EMAIL = `[E-MAIL DE CONTATO — ${PLACEHOLDER_MARK}]`;

/** Days to answer a request, as promised in the text below. */
export const REQUEST_DEADLINE_DAYS = 15;

export interface LegalSection {
  title: string;
  paragraphs?: string[];
  items?: string[];
}

export interface LegalDocument {
  route: LegalRoute;
  title: string;
  intro: string;
  sections: LegalSection[];
}

export const PRIVACY_POLICY: LegalDocument = {
  route: 'privacidade',
  title: LEGAL_TITLES.privacidade,
  intro:
    'Esta página explica, em palavras simples, quais dados o FinançasPro guarda no modo nuvem, onde eles ficam e como pedir para apagá-los. Ela vale para o teste fechado (beta). No modo local, o app não envia nada para servidor nenhum.',
  sections: [
    {
      title: 'Quem responde pelos seus dados',
      paragraphs: [
        `${CONTROLLER_NAME} é quem decide o que acontece com os dados deste app (o "controlador", na Lei Geral de Proteção de Dados).`,
        `Para qualquer dúvida ou pedido, escreva para ${CONTACT_EMAIL}. Esse é o canal oficial do beta.`,
      ],
    },
    {
      title: 'Quais dados existem',
      items: [
        'E-mail e nome de exibição: identificam a sua conta, confirmam o cadastro e permitem redefinir a senha.',
        'Cofre cifrado: suas transações, cartões, compras, faturas e regras são embaralhadas no seu aparelho antes de subir. O servidor guarda só um bloco de texto cifrado.',
        'Embrulhos da chave: pedaços cifrados que só a sua senha ou o seu kit de recuperação conseguem abrir.',
        'Opiniões enviadas em "Dar opinião": o texto que você escrever, o nome da tela em que você estava e a versão do app.',
        'Registros técnicos dos provedores: data, hora e endereço IP dos acessos ficam nos registros do Supabase e da Cloudflare, pelo prazo deles.',
        'O app não pede CPF, telefone nem endereço, e não se conecta ao seu banco.',
      ],
    },
    {
      title: 'Para que servem',
      paragraphs: [
        'Os dados da conta servem para você entrar, manter seus dados sincronizados entre aparelhos e receber e-mails sobre a própria conta. As opiniões servem para corrigir defeitos e decidir o que melhorar.',
        'A base legal é a execução do contrato de uso do beta, que você aceita no cadastro (art. 7º, V, da LGPD), e o seu consentimento específico para a transferência internacional (art. 33, VIII).',
      ],
    },
    {
      title: 'Onde os dados ficam e transferência internacional',
      items: [
        'Supabase (login e banco de dados): o banco fica na região de São Paulo; a empresa é sediada nos Estados Unidos e sua equipe pode acessar a infraestrutura de fora do Brasil.',
        'Cloudflare (entrega do site): rede distribuída por vários países.',
        'Google (Gmail): envia os e-mails de confirmação de cadastro e de redefinição de senha.',
      ],
      paragraphs: [
        'Por causa disso, os dados da sua conta podem ser tratados fora do Brasil. É por isso que o cadastro pede uma caixa de consentimento só para esse ponto. O conteúdo financeiro continua cifrado onde quer que esteja: sair do país não o torna legível.',
      ],
    },
    {
      title: 'O que ninguém consegue ver',
      items: [
        'A sua senha: ela não sai do seu aparelho. O servidor recebe um segredo derivado dela, que não abre os seus dados.',
        'O seu kit de recuperação: as 12 palavras nunca são enviadas.',
        'O conteúdo do cofre: nem o responsável pelo app nem o Supabase conseguem ler suas transações.',
      ],
      paragraphs: [
        'A outra face disso: se você perder a senha e o kit ao mesmo tempo, ninguém consegue recuperar seus dados. Guarde o kit em papel.',
      ],
    },
    {
      title: 'Por quanto tempo',
      items: [
        'Conta, cofre e opiniões: enquanto a sua conta existir ou até você pedir a exclusão.',
        'Cópias de segurança do cofre: o servidor guarda até 7 versões anteriores, também cifradas.',
        'Embrulhos antigos de chave: cerca de 30 dias, para o caso de uma troca de senha dar errado.',
        'Registros técnicos: valem os prazos dos provedores (no plano grátis do Supabase, cerca de 1 dia).',
        'Se o beta terminar, o aviso de encerramento é enviado por e-mail com 30 dias de antecedência antes de apagar as contas.',
      ],
    },
    {
      title: 'Seus direitos',
      items: [
        'Saber se há tratamento dos seus dados e acessar o que existe.',
        'Corrigir dados incompletos ou errados.',
        'Pedir a exclusão dos dados tratados com o seu consentimento.',
        'Revogar o consentimento e encerrar a conta.',
        'Saber com quem os dados são compartilhados (a lista está acima).',
        'Levar seus dados embora: Configurações → Exportar backup gera um arquivo com tudo.',
      ],
      paragraphs: [
        `Para exercer qualquer um deles, escreva para ${CONTACT_EMAIL}. A resposta sai em até ${REQUEST_DEADLINE_DAYS} dias.`,
        'A exclusão é feita à mão pelo responsável no painel do Supabase: apaga a conta, o cofre cifrado, as cópias de segurança e as opiniões ligadas a ela. Ainda não existe um botão de "apagar minha conta" dentro do app.',
      ],
    },
    {
      title: 'Cookies e medição de uso',
      paragraphs: [
        'O app não usa cookies de publicidade nem ferramenta de medição de audiência. Ele guarda no seu navegador apenas o necessário para manter você conectado e uma cópia cifrada dos seus dados, para funcionar sem internet.',
      ],
    },
    {
      title: 'Incidentes de segurança',
      paragraphs: [
        'Se acontecer um incidente com risco relevante para você, o responsável avisa você e a Autoridade Nacional de Proteção de Dados (ANPD).',
      ],
    },
    {
      title: 'Mudanças nesta política',
      paragraphs: [
        `A versão deste texto é ${LEGAL_VERSION}. Mudanças importantes serão avisadas por e-mail ou na entrada do app.`,
      ],
    },
  ],
};

export const BETA_TERMS: LegalDocument = {
  route: 'termos',
  title: LEGAL_TITLES.termos,
  intro:
    'O FinançasPro está em teste fechado. Estas são as regras do teste, em palavras simples. Ao criar a conta, você concorda com elas.',
  sections: [
    {
      title: 'O que é este beta',
      paragraphs: [
        'É um teste gratuito, por convite, de um app que organiza finanças pessoais a partir de extratos e faturas que você mesmo importa. Não há cobrança nem plano pago no beta.',
      ],
    },
    {
      title: 'Sem garantia',
      items: [
        'O app é oferecido no estado em que se encontra, com os defeitos que tiver.',
        'Ele pode sair do ar, ficar indisponível por dias ou mudar de comportamento entre uma versão e outra.',
        'Dados podem se perder por defeito do app, por falha do provedor ou por perda da sua senha e do seu kit.',
        'Não use o app como único lugar onde os seus registros existem. Exporte backups de vez em quando.',
      ],
      paragraphs: [
        'Nada aqui afasta os direitos que a lei brasileira garante a você.',
      ],
    },
    {
      title: 'O que depende de você',
      items: [
        'Guardar o kit de recuperação em papel, longe do computador. Sem ele e sem a senha, seus dados não voltam.',
        'Escolher uma senha forte, usada só aqui.',
        'Exportar backups em Configurações de tempos em tempos.',
        'Não compartilhar a sua conta com outras pessoas.',
      ],
    },
    {
      title: 'O que o app não faz',
      items: [
        'Não se conecta ao seu banco e não movimenta dinheiro.',
        'Não é consultoria financeira, contábil nem tributária: os números dependem dos arquivos que você importa.',
        'Não recupera dados por e-mail: o e-mail devolve o acesso à conta, e só o kit devolve os dados.',
      ],
    },
    {
      title: 'Uso aceitável',
      items: [
        'Use o app com os seus próprios dados. Não suba dados de outras pessoas sem autorização delas.',
        'Não tente invadir, sobrecarregar ou burlar os limites do serviço.',
      ],
    },
    {
      title: 'Encerramento',
      paragraphs: [
        `Você pode parar de usar quando quiser e pedir a exclusão da conta pelo e-mail ${CONTACT_EMAIL}.`,
        'O responsável pode encerrar o beta, avisando por e-mail com 30 dias de antecedência antes de apagar as contas.',
      ],
    },
    {
      title: 'Consentimento registrado',
      paragraphs: [
        `No cadastro você marca duas caixas: uma para estes termos e a política de privacidade, e outra, separada, para a transferência internacional dos dados da conta. O app guarda junto da sua conta a data do aceite e a versão do texto (${LEGAL_VERSION}), apenas como registro.`,
      ],
    },
    {
      title: 'Contato',
      paragraphs: [`Dúvidas, pedidos e reclamações: ${CONTACT_EMAIL} (responsável: ${CONTROLLER_NAME}).`],
    },
  ],
};

export const LEGAL_DOCUMENTS: Record<LegalRoute, LegalDocument> = {
  privacidade: PRIVACY_POLICY,
  termos: BETA_TERMS,
};

/** True while the owner has not replaced the markers; the page warns the reader. */
export function hasPendingPlaceholders(document: LegalDocument): boolean {
  return allText(document).includes(PLACEHOLDER_MARK);
}

function allText(document: LegalDocument): string {
  const parts = [document.title, document.intro];
  for (const section of document.sections) {
    parts.push(section.title, ...(section.paragraphs ?? []), ...(section.items ?? []));
  }
  return parts.join('\n');
}

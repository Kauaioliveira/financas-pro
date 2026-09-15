/**
 * Testers' opinion, sent to the `feedback` table (only insert, docs §7).
 *
 * Nothing financial goes in it: the app sends the text the person wrote, the name of
 * the screen and the version of the build. No amounts, descriptions, bank or file names.
 */

export const FEEDBACK_KINDS = ['bug', 'ideia', 'elogio', 'outro'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/** Same limit as the check constraint of the table. */
export const FEEDBACK_MAX_LENGTH = 2_000;
/** Same limits as the table; the screen name and the version are ours, these are guards. */
export const FEEDBACK_SCREEN_MAX_LENGTH = 40;

export const FEEDBACK_KIND_LABELS: Record<FeedbackKind, string> = {
  bug: 'Algo com defeito',
  ideia: 'Ideia ou sugestão',
  elogio: 'Elogio',
  outro: 'Outro assunto',
};

export interface Feedback {
  kind: FeedbackKind;
  message: string;
  /** Screen the person was on, or null. */
  screen: string | null;
  /** Build of the app, or null. */
  appVersion: string | null;
}

/**
 * The message ready to send, or an error message in Portuguese. The server checks the
 * same rules; checking here avoids a round trip and says what to fix.
 */
export function prepareFeedback(input: {
  kind: string;
  message: string;
  screen?: string | null;
  appVersion?: string | null;
}): { feedback: Feedback } | { error: string } {
  if (!FEEDBACK_KINDS.includes(input.kind as FeedbackKind)) {
    return { error: 'Escolha o tipo da sua opinião.' };
  }
  const message = input.message.trim();
  if (!message) return { error: 'Escreva sua opinião antes de enviar.' };
  if (message.length > FEEDBACK_MAX_LENGTH) {
    return { error: `Sua opinião tem ${message.length} caracteres. O limite é ${FEEDBACK_MAX_LENGTH}.` };
  }
  return {
    feedback: {
      kind: input.kind as FeedbackKind,
      message,
      screen: cut(input.screen, FEEDBACK_SCREEN_MAX_LENGTH),
      appVersion: cut(input.appVersion, FEEDBACK_SCREEN_MAX_LENGTH),
    },
  };
}

function cut(value: string | null | undefined, max: number): string | null {
  const text = (value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

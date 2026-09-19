export const SUMMIT_RULES = Object.freeze({
  version: 1,
  target: 5,
  questions: 12,
});

/** A pure replay of confirmed answers, never a client-supplied height or score. */
export function summitScore(answers: readonly { esCorrecta: boolean }[]) {
  let escalon = 0;
  let maximoEscalon = 0;
  let aciertos = 0;
  let ultimoMovimiento = 0;
  if (answers.length > SUMMIT_RULES.questions)
    throw new Error('Too many answers');
  for (const answer of answers) {
    if (escalon === SUMMIT_RULES.target)
      throw new Error('Answers after victory');
    const previous = escalon;
    escalon = Math.max(0, escalon + (answer.esCorrecta ? 1 : -1));
    maximoEscalon = Math.max(maximoEscalon, escalon);
    aciertos += Number(answer.esCorrecta);
    ultimoMovimiento = escalon - previous;
  }
  return {
    escalon,
    maximoEscalon,
    aciertos,
    errores: answers.length - aciertos,
    respondidas: answers.length,
    ultimoMovimiento,
    estado:
      escalon === SUMMIT_RULES.target
        ? 'VICTORIA'
        : answers.length === SUMMIT_RULES.questions
          ? 'AGOTADO'
          : 'ACTIVO',
  };
}

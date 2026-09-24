export const STAR_RESCUE_RULES = Object.freeze({
  version: 1,
  target: 6,
  questions: 10,
  starsPerConstellation: 3,
});

/** Replay confirmed answers only. Incorrect answers never remove stars. */
export function starRescueScore(answers: readonly { esCorrecta: boolean }[]) {
  if (answers.length > STAR_RESCUE_RULES.questions)
    throw new Error('Too many answers');
  let estrellas = 0;
  for (const answer of answers) {
    if (estrellas === STAR_RESCUE_RULES.target)
      throw new Error('Answers after victory');
    estrellas += Number(answer.esCorrecta);
  }
  return {
    estrellas,
    constelaciones: Math.floor(
      estrellas / STAR_RESCUE_RULES.starsPerConstellation,
    ),
    aciertos: estrellas,
    errores: answers.length - estrellas,
    respondidas: answers.length,
    estado:
      estrellas === STAR_RESCUE_RULES.target
        ? 'VICTORIA'
        : answers.length === STAR_RESCUE_RULES.questions
          ? 'AGOTADO'
          : 'ACTIVO',
  };
}

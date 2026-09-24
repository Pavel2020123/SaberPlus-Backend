export const KNOWLEDGE_SHIELD_RULES = Object.freeze({
  version: 1,
  maximumShield: 3,
  rounds: 3,
  questionsPerRound: 4,
  questions: 12,
});

/** Replay trusted answers. The last attack precedes the victory check. */
export function knowledgeShieldScore(
  answers: readonly { esCorrecta: boolean }[],
) {
  if (answers.length > KNOWLEDGE_SHIELD_RULES.questions)
    throw new Error('Too many answers');
  let escudo: number = KNOWLEDGE_SHIELD_RULES.maximumShield;
  let paginas = 0;
  let aciertos = 0;
  for (const [index, answer] of answers.entries()) {
    if (escudo === 0) throw new Error('Answers after defeat');
    if (typeof answer.esCorrecta !== 'boolean')
      throw new Error('Invalid answer');
    aciertos += Number(answer.esCorrecta);
    escudo = Math.max(
      0,
      Math.min(
        KNOWLEDGE_SHIELD_RULES.maximumShield,
        escudo + (answer.esCorrecta ? 1 : -1),
      ),
    );
    if (
      (index + 1) % KNOWLEDGE_SHIELD_RULES.questionsPerRound === 0 &&
      escudo > 0
    ) {
      escudo--;
      if (escudo > 0) paginas++;
    }
  }
  return {
    escudo,
    paginas,
    aciertos,
    errores: answers.length - aciertos,
    respondidas: answers.length,
    estado:
      escudo === 0
        ? 'DERROTA'
        : answers.length === KNOWLEDGE_SHIELD_RULES.questions
          ? 'VICTORIA'
          : 'ACTIVO',
  };
}

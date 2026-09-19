export const GUARDIAN_RULES = {
  version: 1,
  questions: 8,
  target: 6,
  shields: 3,
} as const;

export function guardianScore(answers: { esCorrecta: boolean }[]) {
  const aciertos = answers.filter((answer) => answer.esCorrecta).length;
  const errores = answers.length - aciertos;
  return {
    aciertos,
    errores,
    escudo: Math.max(0, GUARDIAN_RULES.shields - errores),
    energiaGuardian: Math.max(0, GUARDIAN_RULES.target - aciertos),
    estado:
      aciertos >= GUARDIAN_RULES.target
        ? 'VICTORIA'
        : errores >= GUARDIAN_RULES.shields
          ? 'DERROTA'
          : 'ACTIVO',
  };
}

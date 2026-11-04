/** Preserve the raw input: implicit conversion must not turn "false" into true. */
export function readCompetitiveOptIn({ obj }: { obj: unknown }): unknown {
  return obj !== null && typeof obj === 'object' && 'competitive' in obj
    ? obj.competitive
    : undefined;
}

// Types for the existing CommonJS summary parser; no runtime module change.
export const keys: string[];
export function inspectSummary(
  output: string,
  fileFailed?: boolean,
): {
  valid: boolean;
  missing: string[];
  errors: string[];
  summary: Record<string, number>;
};

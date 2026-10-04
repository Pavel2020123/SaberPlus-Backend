// Validate Node's complete spec summary, never progress JSON or test titles.
const keys = [
  'tests',
  'suites',
  'pass',
  'fail',
  'cancelled',
  'skipped',
  'todo',
  'duration_ms',
];
function inspectSummary(output, fileFailed = false) {
  const summary = {},
    errors = [],
    missing = [];
  const lines = output.replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/);
  for (const key of keys) {
    const entries = lines.filter((line) => line.startsWith(`ℹ ${key} `));
    if (entries.length !== 1) {
      if (!entries.length) missing.push(key);
      errors.push(
        `${key}: expected exactly one summary field, got ${entries.length}`,
      );
      continue;
    }
    const value = entries[0].slice(`ℹ ${key} `.length);
    const numeric = key === 'duration_ms' ? /^\d+(?:\.\d+)?$/ : /^\d+$/;
    const count = Number(value);
    if (
      !numeric.test(value) ||
      !Number.isFinite(count) ||
      (key !== 'duration_ms' && !Number.isSafeInteger(count))
    ) {
      errors.push(`${key}: invalid summary value`);
      continue;
    }
    summary[key] = count;
  }
  if (fileFailed) errors.push('file process failed');
  for (const key of ['fail', 'cancelled', 'skipped', 'todo'])
    if (summary[key] !== undefined && summary[key] !== 0)
      errors.push(`${key}: ${summary[key]}`);
  if (summary.tests !== undefined && summary.tests !== summary.pass)
    errors.push('tests differs from pass');
  if (summary.tests === 0) errors.push('file executed no tests');
  return { summary, missing, errors, valid: errors.length === 0 };
}
module.exports = { keys, inspectSummary };

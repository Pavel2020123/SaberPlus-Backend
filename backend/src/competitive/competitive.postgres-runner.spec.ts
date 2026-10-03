import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { keys, inspectSummary } =
  require('../../tool/competitive_postgres_summary.cjs') as {
    keys: string[];
    inspectSummary: (
      output: string,
      fileFailed?: boolean,
    ) => {
      valid: boolean;
      missing: string[];
      errors: string[];
      summary: Record<string, number>;
    };
  };
const values: Record<string, number> = {
  tests: 2,
  suites: 0,
  pass: 2,
  fail: 0,
  cancelled: 0,
  skipped: 0,
  todo: 0,
  duration_ms: 12.5,
};
const report = (changes: Record<string, number> = {}) =>
  keys.map((key) => `ℹ ${key} ${{ ...values, ...changes }[key]}`).join('\n');

describe('competitive PostgreSQL runner complete summary gate', () => {
  it('accepts a complete passing summary with CRLF and progress diagnostics', () => {
    expect(
      inspectSummary(
        '{"phase":"test:pass","name":"tests 99"}\n' +
          report().replaceAll('\n', '\r\n'),
      ).valid,
    ).toBe(true);
  });
  it.each(keys)('rejects a missing %s field', (key) => {
    const result = inspectSummary(
      report()
        .split('\n')
        .filter((line) => !line.startsWith(`ℹ ${key} `))
        .join('\n'),
    );
    expect(result.valid).toBe(false);
    expect(result.missing).toContain(key);
  });
  it.each(['fail', 'cancelled', 'skipped', 'todo'])(
    'rejects nonzero %s despite a successful process',
    (key) => {
      expect(inspectSummary(report({ [key]: 1 })).valid).toBe(false);
    },
  );
  it('rejects failure, mismatched counts, empty coverage, duplicate and malformed fields', () => {
    for (const result of [
      inspectSummary(report(), true),
      inspectSummary(report({ pass: 1 })),
      inspectSummary(report({ tests: 0, pass: 0 })),
      inspectSummary(report() + '\nℹ pass 2'),
      inspectSummary(report().replace('ℹ pass 2', 'ℹ pass -2')),
      inspectSummary(
        report().replace('ℹ duration_ms 12.5', 'ℹ duration_ms NaN'),
      ),
      inspectSummary(report().replace('ℹ tests 2', 'ℹ tests 9007199254740992')),
    ])
      expect(result.valid).toBe(false);
  });
  it('rejects a real Node process that exits successfully with skipped and TODO tests', () => {
    const directory = mkdtempSync(
      join(tmpdir(), 'saberplus-summary-regression-'),
    );
    const file = join(directory, 'summary.test.cjs');
    try {
      writeFileSync(
        file,
        "const {test}=require('node:test');test('ok',()=>{});test.skip('skipped',()=>{});test.todo('pending');",
      );
      const output = execFileSync(
        process.execPath,
        ['--test', '--test-reporter=spec', file],
        { encoding: 'utf8' },
      );
      const result = inspectSummary(output);
      expect(result.summary.skipped).toBe(1);
      expect(result.summary.todo).toBe(1);
      expect(result.valid).toBe(false);
    } finally {
      rmSync(directory, { recursive: true });
    }
  });
});

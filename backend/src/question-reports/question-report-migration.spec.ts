import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Static regression only: this does NOT execute SQL or prove effective PostgreSQL privileges.
describe('question report migration contract (static)', () => {
  const sql = readFileSync(
    join(
      __dirname,
      '../../prisma/migrations/20261017220000_academic_question_reports/migration.sql',
    ),
    'utf8',
  );
  it.each([
    'ReportePregunta',
    'OperacionReportePregunta',
    'AuditoriaReportePregunta',
    'TasaReportePregunta',
  ])('locks direct public access to %s', (name) => {
    expect(sql).toContain(`ALTER TABLE "${name}" ENABLE ROW LEVEL SECURITY`);
    for (const role of ['PUBLIC', 'anon', 'authenticated']) {
      expect(sql).toMatch(
        new RegExp(`REVOKE ALL ON[^;]*"${name}"[^;]*FROM ${role}`),
      );
    }
  });
  it('keeps semantic/idempotency/audit uniqueness and retains question evidence', () => {
    expect(sql).toContain('"ReportePregunta_autorId_preguntaId_motivo_key"');
    expect(sql).toContain('UNIQUE ("reporteId", "revision")');
    expect(sql).toContain('REFERENCES "Pregunta"("id") ON DELETE RESTRICT');
    expect(sql).toContain('"huellaSolicitud" ~');
    expect(sql).toContain('"solicitudes" > 0');
  });
  it('account deletion removes link identities instead of cascading the entire incident', () => {
    expect(
      sql.match(/REFERENCES "Usuario"\("id"\) ON DELETE SET NULL/g),
    ).toHaveLength(3);
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain('TRUNCATE');
  });
});

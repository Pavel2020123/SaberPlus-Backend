// Read-only DB evidence for R4. Case 11 saves a local hash baseline, never DB writes.
import assert from 'node:assert/strict';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { validateCompetitiveDatabase } from './test_competitive_postgres.mjs';

let db,
  stage = 'ownership';
const boundary = process.argv.length === 3 && process.argv[2] === '--case3';
const duplicate = process.argv.length === 3 && process.argv[2] === '--case4';
const recovery = process.argv.length === 3 && process.argv[2] === '--case6';
const moderation = process.argv.length === 3 && process.argv[2] === '--case10';
const coverageBefore =
  process.argv.length === 3 && process.argv[2] === '--case11-before';
const coverageAfter =
  process.argv.length === 3 && process.argv[2] === '--case11';
const coverage = coverageBefore || coverageAfter;
const caseNumber = coverage
  ? 11
  : moderation
    ? 10
    : boundary
      ? 3
      : duplicate
        ? 4
        : recovery
          ? 6
          : 2;
const expectedReason = boundary
  ? 'OTRO'
  : recovery
    ? 'EXPLICACION_INCORRECTA'
    : 'ENUNCIADO_CONFUSO';
let phasePrefix = `r4-human-case-${caseNumber}`;
try {
  assert.ok(
    process.argv.length === 2 ||
      boundary ||
      duplicate ||
      recovery ||
      moderation ||
      coverage,
    'Only documented R4 case flags are supported.',
  );
  const directory = await realpath(
    process.env.SABERPLUS_LOCAL_SESSION || 'missing-owned-session',
  );
  assert.equal(dirname(directory), await realpath(tmpdir()));
  assert.ok(basename(directory).startsWith('saberplus-i2-local-'));
  const marker = JSON.parse(
    await readFile(join(directory, 'owner.json'), 'utf8'),
  );
  validateCompetitiveDatabase(marker.url, marker);
  const exec = promisify(execFile);
  const context = (
    await exec('docker', ['context', 'show'], { windowsHide: true })
  ).stdout.trim();
  const endpoint = (
    await exec(
      'docker',
      ['context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}'],
      { windowsHide: true },
    )
  ).stdout.trim();
  assert.ok(
    endpoint.startsWith('npipe:////./pipe/') || endpoint.startsWith('unix:///'),
  );
  const labels = JSON.parse(
    (
      await exec(
        'docker',
        [
          '--context',
          context,
          'inspect',
          '--format',
          '{{json .Config.Labels}}',
          `saberplus-i2-local-${marker.nonce}`,
        ],
        { windowsHide: true },
      )
    ).stdout,
  );
  assert.equal(labels['saberplus-competitive-disposable-v1'], marker.nonce);
  const fixtures = JSON.parse(
    await readFile(join(directory, 'reports-fixtures.json'), 'utf8'),
  );
  const automaticResume = fixtures.automaticResumeCase7 === true;
  if (automaticResume && !moderation && !coverage)
    phasePrefix = `r4-automatic-resume-check-${caseNumber}`;
  db = new PrismaClient({ datasources: { db: { url: marker.url } } });
  stage = 'report-count-and-content';
  const student = await db.usuario.findUniqueOrThrow({
    where: { correo: 'student@example.invalid' },
    select: { id: true },
  });
  const rows = await db.reportePregunta.findMany({
    where: { autorId: student.id, preguntaId: { in: fixtures.questionIds } },
    include: { operaciones: true, auditorias: true },
  });
  if (coverage) {
    stage = 'coverage-and-bank-xp-baseline';
    assert.equal(rows.length, 3);
    const report = rows.find((row) => row.motivo === 'ENUNCIADO_CONFUSO');
    assert.ok(report);
    assert.equal(report.estado, coverageBefore ? 'EN_REVISION' : 'RESUELTO');
    assert.equal(report.revision, coverageBefore ? 1 : 2);
    const questions = await db.pregunta.findMany({
      where: { subtemaId: fixtures.subthemeId },
      orderBy: { id: 'asc' },
      include: { respuestas: { orderBy: { id: 'asc' } } },
    });
    assert.equal(questions.length, 2);
    assert.ok(questions.every((row) => row.estadoContenido === 'PUBLICADO'));
    const theme = await db.tema.findUniqueOrThrow({
      where: { id: fixtures.themeId },
    });
    const subtheme = await db.subtema.findUniqueOrThrow({
      where: { id: fixtures.subthemeId },
    });
    const xp = await db.usuario.findUniqueOrThrow({
      where: { id: student.id },
      select: { xpTotal: true },
    });
    const competitive = await db.balanceCompetitivo.findMany({
      where: { usuarioId: student.id },
      orderBy: [{ gameId: 'asc' }, { temporada: 'asc' }],
    });
    const digest = createHash('sha256')
      .update(JSON.stringify({ questions, theme, subtheme, xp, competitive }))
      .digest('hex');
    const open = rows.filter((row) =>
      ['PENDIENTE', 'EN_REVISION'].includes(row.estado),
    );
    assert.equal(open.length, coverageBefore ? 3 : 2);
    assert.equal(new Set(open.map((row) => row.preguntaId)).size, 1);
    const baselineFile = join(directory, 'reports-case11-baseline.json');
    if (coverageBefore) {
      // Exclusive create: never replace a previous baseline to hide a difference.
      await writeFile(
        baselineFile,
        JSON.stringify({
          purpose: 'r4-case11-baseline',
          nonce: marker.nonce,
          subthemeId: fixtures.subthemeId,
          digest,
        }),
        { flag: 'wx', mode: 0o600 },
      );
    } else {
      const baseline = JSON.parse(await readFile(baselineFile, 'utf8'));
      assert.equal(baseline.purpose, 'r4-case11-baseline');
      assert.equal(baseline.nonce, marker.nonce);
      assert.equal(baseline.subthemeId, fixtures.subthemeId);
      assert.equal(digest, baseline.digest);
      assert.equal(report.auditorias.length, 3);
      const closed = report.auditorias.find((row) => row.revision === 2);
      assert.ok(closed);
      assert.equal(closed.estadoAnterior, 'EN_REVISION');
      assert.equal(closed.estadoNuevo, 'RESUELTO');
      assert.ok(closed.motivoRevision?.trim());
      const admin = await db.usuario.findUniqueOrThrow({
        where: { correo: 'admin@example.invalid' },
        select: { id: true },
      });
      assert.equal(closed.actorId, admin.id);
      const decisions = report.operaciones.filter(
        (row) => row.tipo === 'DECIDIR',
      );
      assert.equal(decisions.length, 2);
      const receipt = decisions.find((row) => row.resultado.revision === 2);
      assert.ok(receipt);
      assert.equal(receipt.actorId, admin.id);
      assert.equal(receipt.resultado.estado, 'RESUELTO');
      assert.ok(
        rows
          .filter((row) => row.id !== report.id)
          .every((row) => row.estado === 'PENDIENTE' && row.revision === 0),
      );
    }
    console.log(
      JSON.stringify({
        phase: coverageBefore
          ? 'r4-case-11-baseline-saved'
          : 'r4-case-11-storage-verified',
        databaseReadOnly: true,
        reports: 3,
        open: open.length,
        distinctAffectedQuestions: 1,
        published: 2,
        baselineCreated: coverageBefore,
        bankAndXpUnchanged: coverageAfter,
        humanCoverageConfirmationRecordedSeparately: true,
      }),
    );
  } else if (moderation) {
    stage = 'admin-decision-receipt-audit';
    assert.equal(rows.length, 3);
    const report = rows.find((row) => row.motivo === 'ENUNCIADO_CONFUSO');
    assert.ok(report);
    assert.equal(report.estado, 'EN_REVISION');
    assert.equal(report.revision, 1);
    assert.equal(report.auditorias.length, 2);
    const creation = report.auditorias.find((row) => row.revision === 0);
    const decision = report.auditorias.find((row) => row.revision === 1);
    assert.ok(creation && decision);
    assert.equal(creation.estadoNuevo, 'PENDIENTE');
    assert.equal(decision.estadoAnterior, 'PENDIENTE');
    assert.equal(decision.estadoNuevo, 'EN_REVISION');
    assert.equal(typeof decision.motivoRevision, 'string');
    assert.ok(
      decision.motivoRevision.trim().length > 0 &&
        [...decision.motivoRevision].length <= 500,
    );
    const admin = await db.usuario.findUniqueOrThrow({
      where: { correo: 'admin@example.invalid' },
      select: { id: true },
    });
    assert.equal(decision.actorId, admin.id);
    const decisions = report.operaciones.filter(
      (row) => row.tipo === 'DECIDIR',
    );
    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].actorId, admin.id);
    assert.equal(decisions[0].resultado.id, report.id);
    assert.equal(decisions[0].resultado.revision, 1);
    assert.equal(decisions[0].resultado.estado, 'EN_REVISION');
    for (const other of rows.filter((row) => row.id !== report.id)) {
      assert.equal(other.estado, 'PENDIENTE');
      assert.equal(other.revision, 0);
      assert.equal(other.auditorias.length, 1);
      assert.ok(other.operaciones.every((row) => row.tipo === 'CREAR'));
    }
    console.log(
      JSON.stringify({
        phase: 'r4-human-case-10-storage-verified',
        readOnly: true,
        reports: 3,
        pending: 2,
        inReview: 1,
        revision: 1,
        adminDecisionReceipts: 1,
        auditEntries: 2,
        internalReasonPresent: true,
        adminActorVerified: true,
        otherReportsUnchanged: true,
        automaticBaseFixtures: automaticResume,
        manualUiConfirmationRecordedSeparately: true,
      }),
    );
  } else {
    console.log(
      JSON.stringify({
        phase: `${phasePrefix}-read-only-diagnostic`,
        reports: rows.length,
        states: rows.map((row) => row.estado),
        reasons: rows.map((row) => row.motivo),
        detailsMatchSuggested: rows.map(
          (row) =>
            row.detalle ===
            'Reporte de ensayo R4: revisar la redacción de esta pregunta.',
        ),
      }),
    );
    assert.equal(rows.length, recovery ? 3 : boundary || duplicate ? 2 : 1);
    const report = rows.find((row) => row.motivo === expectedReason);
    assert.ok(report);
    assert.equal(report.estado, 'PENDIENTE');
    assert.equal(report.revision, 0);
    assert.equal(report.motivo, expectedReason);
    // Human text may differ from the suggested sample. Verify the actual payload
    // was preserved in its receipt, without rewriting it to make the sample match.
    assert.equal(typeof report.detalle, 'string');
    assert.ok(
      report.detalle.trim().length > 0 &&
        [...report.detalle.trim()].length <= 500,
    );
    if (boundary) {
      assert.equal([...report.detalle].length, 500);
      const first = rows.find((row) => row.motivo === 'ENUNCIADO_CONFUSO');
      assert.ok(first);
      assert.equal(first.preguntaId, report.preguntaId);
      assert.equal(first.operaciones.length, 1);
      assert.equal(first.auditorias.length, 1);
      assert.equal(first.operaciones[0].resultado.detalle, first.detalle);
      assert.ok(
        rows.every((row) => row.estado === 'PENDIENTE' && row.revision === 0),
      );
    }
    assert.equal(report.subtemaIdCapturado, fixtures.subthemeId);
    assert.equal(report.areaCapturada, 'MATEMATICAS');
    stage = 'receipt-and-audit';
    assert.equal(report.operaciones.length, duplicate ? 2 : 1);
    const original = report.operaciones.find(
      (operation) => operation.resultado.duplicado === false,
    );
    assert.ok(original);
    for (const operation of report.operaciones) {
      assert.equal(operation.tipo, 'CREAR');
      assert.equal(operation.actorId, student.id);
      assert.equal(operation.resultado.id, report.id);
      assert.equal(operation.resultado.detalle, report.detalle);
      assert.equal(operation.resultado.preguntaId, report.preguntaId);
      assert.equal(operation.resultado.motivo, report.motivo);
    }
    if (duplicate) {
      const replay = report.operaciones.find(
        (operation) => operation.resultado.duplicado === true,
      );
      assert.ok(replay);
      assert.notEqual(replay.id, original.id);
      assert.notEqual(replay.huellaSolicitud, original.huellaSolicitud);
      assert.equal(
        report.fechaActualizacion.toISOString(),
        original.resultado.fechaActualizacion,
      );
      const other = rows.find((row) => row.motivo === 'OTRO');
      assert.ok(other);
      assert.equal(other.preguntaId, report.preguntaId);
      assert.equal([...other.detalle].length, 500);
      assert.equal(other.operaciones.length, 1);
      assert.equal(other.auditorias.length, 1);
      assert.ok(
        rows.every((row) => row.estado === 'PENDIENTE' && row.revision === 0),
      );
    }
    if (recovery) {
      const first = rows.find((row) => row.motivo === 'ENUNCIADO_CONFUSO');
      const other = rows.find((row) => row.motivo === 'OTRO');
      assert.ok(first && other);
      assert.equal(first.preguntaId, report.preguntaId);
      assert.equal(other.preguntaId, report.preguntaId);
      assert.equal(first.operaciones.length, 2);
      assert.equal(other.operaciones.length, 1);
      assert.equal([...other.detalle].length, 500);
      for (const previous of [first, other]) {
        const receipt = previous.operaciones.find(
          (operation) => operation.resultado.duplicado === false,
        );
        assert.ok(receipt);
        assert.equal(receipt.resultado.detalle, previous.detalle);
        assert.equal(
          receipt.resultado.fechaActualizacion,
          previous.fechaActualizacion.toISOString(),
        );
        assert.equal(previous.auditorias.length, 1);
      }
      assert.ok(
        rows.every((row) => row.estado === 'PENDIENTE' && row.revision === 0),
      );
    }
    assert.equal(report.auditorias.length, 1);
    assert.equal(report.auditorias[0].estadoNuevo, 'PENDIENTE');
    assert.equal(report.auditorias[0].revision, 0);
    stage = 'own-answer-evidence';
    assert.ok(
      await db.historialRespuesta.findFirst({
        where: {
          usuarioId: student.id,
          preguntaId: report.preguntaId,
          origen: { in: ['PRACTICA', 'PERSONALIZADO', 'SIMULACRO'] },
        },
        select: { id: true },
      }),
    );
    assert.equal(report.snapshot.tipo, 'CAPTURA_SERVIDOR_RECEPCION');
    assert.equal(report.snapshot.historicoExacto, false);
    assert.equal(report.snapshot.pregunta.id, report.preguntaId);
    console.log(
      JSON.stringify({
        phase: `${phasePrefix}-storage-verified`,
        reports: rows.length,
        creationReceiptsForCheckedReport: report.operaciones.length,
        auditEntriesForCheckedReport: 1,
        status: 'PENDIENTE',
        ownAnsweredQuestion: true,
        serverSnapshot: true,
        readOnly: true,
        ...(boundary
          ? { storedUnicodeCharacters: 500, firstReportPreserved: true }
          : {}),
        ...(duplicate
          ? {
              newReportCreated: false,
              originalDetailPreserved: true,
              duplicateReceipt: true,
              anotherPayload: true,
            }
          : {}),
        ...(recovery
          ? automaticResume
            ? { preparedReportCreatedOnce: true }
            : {
                recoveredReportCreatedOnce: true,
                previousReportsPreserved: true,
              }
          : {}),
        automaticResumeFixture: automaticResume,
        manualCaseClaim: !automaticResume,
      }),
    );
  }
} catch {
  console.error(
    JSON.stringify({
      phase: `${phasePrefix}-check-failed`,
      stage,
      privateDetailsOmitted: true,
    }),
  );
  process.exitCode = 1;
} finally {
  await db?.$disconnect();
}

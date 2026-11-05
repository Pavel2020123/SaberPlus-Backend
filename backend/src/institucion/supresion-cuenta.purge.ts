import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';

/** Only called inside the locked, explicitly reviewed suppression transaction. */
export async function purgarDatosPropios(
  tx: Prisma.TransactionClient,
  usuarioId: string,
  ahora: Date,
) {
  const where = { usuarioId };
  // Delete the owned parent so OV-1's existing cascade also removes completed
  // responses and their snapshot without weakening immutable-result guards.
  await tx.intentoVocacional.deleteMany({ where });
  // Remove private learning and solo-game material, never shared matches or ledgers.
  await tx.eventoRepasoDiferido.deleteMany({ where });
  await tx.repasoDiferido.deleteMany({ where });
  await tx.cuadernoError.deleteMany({ where });
  await tx.historialRespuesta.deleteMany({ where });
  await tx.planEstudioSemanal.deleteMany({ where });
  await tx.diagnosticoInicial.deleteMany({ where });
  await tx.resultadoSimulacro.deleteMany({ where });
  await tx.intentoSimulacro.deleteMany({ where });
  await tx.progresoTema.deleteMany({ where });
  await tx.pomodoroRegistrado.deleteMany({ where });
  // Explicit child order keeps the owned attempt available to privacy guards.
  await tx.triviaPresenceEvent.deleteMany({ where: { attempt: where } });
  await tx.triviaConnection.deleteMany({
    where: { presence: { attempt: where } },
  });
  await tx.triviaPresence.deleteMany({ where: { attempt: where } });
  await tx.triviaRushRespuesta.deleteMany({ where: { intento: where } });
  await tx.triviaRushPotenciador.deleteMany({ where: { intento: where } });
  await tx.triviaRushPregunta.deleteMany({ where: { intento: where } });
  await tx.intentoTriviaRush.deleteMany({ where });
  await tx.concesionRecompensaJuego.deleteMany({ where });
  await tx.intentoGuardian.deleteMany({ where });
  await tx.intentoCima.deleteMany({ where });
  await tx.intentoRescateEstrellas.deleteMany({ where });
  await tx.intentoEscudoConocimiento.deleteMany({ where });
  await tx.batallaEstadistica.deleteMany({ where });
  await tx.claseEstudiante.deleteMany({ where });
  await tx.claseProfesor.deleteMany({ where: { miembro: { usuarioId } } });
  await tx.miembroInstitucion.deleteMany({ where });
  await tx.anuncioLectura.deleteMany({ where });
  await tx.identificadorLogin.deleteMany({ where });
  await tx.saldoPersonalInstitucional.deleteMany({ where });
  await tx.tasaReportePregunta.deleteMany({ where });
  await tx.asignacionLicenciaInstitucional.updateMany({
    where,
    data: { estado: 'RETIRADA', retiradaEn: ahora },
  });

  // Redact identity-bearing strings while the original identity is still available
  // to the SQL redactor. Scores, sequence, hashes and counterpart results stay put.
  await tx.$executeRaw`UPDATE "TiraAflojaEvento" e SET datos=sp_lic4_redact_payload(e.datos,${usuarioId}::uuid)
    WHERE EXISTS (SELECT 1 FROM "PartidaTiraAfloja" p WHERE p.id=e."partidaId" AND (p."jugadorAId"=${usuarioId}::uuid OR p."jugadorBId"=${usuarioId}::uuid))`;
  await tx.$executeRaw`UPDATE "EventoXpCompetitivo" SET metadata=sp_lic4_redact_payload(metadata,${usuarioId}::uuid),
    motivo=sp_lic4_redact_payload(to_jsonb(motivo),${usuarioId}::uuid)#>>'{}'
    WHERE "usuarioId"=${usuarioId}::uuid OR "actorId"=${usuarioId}::uuid`;
  await tx.$executeRaw`UPDATE "OperacionLicenciaInstitucional" SET resultado=sp_lic4_redact_payload(resultado,${usuarioId}::uuid)
    WHERE "actorId"=${usuarioId}::uuid OR position(${usuarioId} in resultado::text)>0`;
  await tx.$executeRaw`UPDATE "AuditoriaInstitucion" SET detalle='{"anonimizado":true}'::jsonb
    WHERE "actorId"=${usuarioId}::uuid OR "afectadoId"=${usuarioId}::uuid`;
  await tx.$executeRaw`UPDATE "OperacionReportePregunta" SET resultado=sp_lic4_redact_payload(resultado,${usuarioId}::uuid) WHERE "actorId"=${usuarioId}::uuid`;
  await tx.$executeRaw`UPDATE "AuditoriaReportePregunta" SET "motivoRevision"='Datos personales retirados'
    WHERE "actorId"=${usuarioId}::uuid OR "reporteId" IN (SELECT id FROM "ReportePregunta" WHERE "autorId"=${usuarioId}::uuid)`;
  await tx.$executeRaw`UPDATE "ReportePregunta" SET detalle='Detalle retirado por privacidad', "autorId"=NULL WHERE "autorId"=${usuarioId}::uuid`;
  await tx.$executeRaw`UPDATE "BatallaReporte" SET detalle=NULL
    WHERE "reportanteId"=${usuarioId}::uuid OR "reportadoId"=${usuarioId}::uuid`;
  await tx.$executeRaw`UPDATE "Anuncio" SET contenido='Contenido retirado por privacidad', titulo='Anuncio retirado', activo=false WHERE "creadoPorId"=${usuarioId}::uuid`;
  await tx.$executeRaw`UPDATE "SolicitudIngresoInstitucion" SET mensaje=NULL WHERE "solicitanteId"=${usuarioId}::uuid`;
  await tx.$executeRaw`UPDATE "SolicitudIngresoEstudiante" SET mensaje=NULL WHERE "estudianteId"=${usuarioId}::uuid`;
  await tx.$executeRaw`UPDATE "SolicitudAltaInstitucion" SET contacto=CASE WHEN lower(contacto)=(SELECT lower(nombre) FROM "Usuario" WHERE id=${usuarioId}::uuid) THEN 'Contacto eliminado' ELSE contacto END,
    historial=sp_lic4_redact_payload(historial,${usuarioId}::uuid), "mensajeSolicitante"='', evidencia=sp_lic4_redact_payload(to_jsonb(evidencia),${usuarioId}::uuid)#>>'{}'
    WHERE "solicitanteId"=${usuarioId}::uuid`;
  await tx.$executeRaw`UPDATE "InvitacionInstitucion" SET correo='cuenta-eliminada-'||${usuarioId}||'@example.invalid'
    WHERE "aceptadoPorId"=${usuarioId}::uuid OR correo=(SELECT correo FROM "Usuario" WHERE id=${usuarioId}::uuid)`;
  await tx.$executeRaw`UPDATE "PagoOrden" SET "motivoRespuesta"=sp_lic4_redact_payload(to_jsonb("motivoRespuesta"),${usuarioId}::uuid)#>>'{}' WHERE "usuarioId"=${usuarioId}::uuid`;
  await tx.solicitudSupresionCuenta.updateMany({
    where: { usuarioId },
    data: { motivo: 'Solicitud anonimizada tras supresión' },
  });

  // Anonymous tombstone preserves shared foreign keys and prevents account revival.
  await tx.usuario.update({
    where: { id: usuarioId },
    data: {
      nombre: 'Cuenta eliminada',
      correo: null,
      identificadorInstitucional: null,
      contrasenaHash: `SUPRIMIDA-${randomBytes(32).toString('hex')}`,
      rol: null,
      institucionId: null,
      fotoPerfil: null,
      descripcion: null,
      tokenVerificacion: null,
      tokenVerificacionExpira: null,
      tokenRecuperacion: null,
      tokenRecuperacionExpira: null,
      correoVerificado: false,
      debeCambiarContrasena: false,
      temporalConsumidaEn: null,
      fechaVencimientoPlan: null,
      codigoReferido: null,
      saldoReferidosCop: 0,
      xpTotal: 0,
      grado: null,
      versionSesion: { increment: 1 },
      suprimidaEn: ahora,
    },
  });
}

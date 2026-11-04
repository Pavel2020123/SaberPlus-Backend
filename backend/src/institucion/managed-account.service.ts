import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { BCRYPT_SALT_ROUNDS } from '../common/constants';
import {
  construirAliasInstitucional,
  normalizarSufijoInstitucional,
} from './identificador-institucional.policy';
import { leerCsvEstudiantesGestionados } from './managed-student-csv.policy';

type Tx = Prisma.TransactionClient;
type Publico = Prisma.InputJsonObject;
interface Entrega {
  resultado: Publico;
  credenciales?: {
    usuarioId: string;
    usuarioInstitucional: string;
    contrasenaTemporal: string;
  }[];
}
export interface ImportacionGestionada {
  csv: string;
  claseId: string;
  huella?: string;
}
const hash = (valor: unknown) =>
  createHash('sha256').update(JSON.stringify(valor)).digest('hex');

@Injectable()
export class ManagedAccountService {
  private readonly trabajosHash = new Set<string>();
  constructor(private readonly prisma: PrismaService) {}

  private async conHashAcotado<T>(
    institucionId: string,
    trabajo: () => Promise<T>,
  ): Promise<T> {
    if (this.trabajosHash.size >= 4 || this.trabajosHash.has(institucionId))
      throw new HttpException(
        'Hay una operación de credenciales en curso. Reintenta después.',
        429,
      );
    this.trabajosHash.add(institucionId);
    try {
      return await trabajo();
    } finally {
      this.trabajosHash.delete(institucionId);
    }
  }

  private async autorizar(
    tx: Tx,
    actorId: string,
    institucionId: string,
    docente = false,
    soloAdmin = false,
  ) {
    const actor = await tx.usuario.findUnique({ where: { id: actorId } });
    if (!actor || actor.debeCambiarContrasena)
      throw new ForbiddenException('Sesión no autorizada.');
    if (actor.rol === 'ADMIN') return { propietario: true };
    const miembro = await tx.miembroInstitucion.findUnique({
      where: { usuarioId: actorId },
    });
    if (
      soloAdmin ||
      actor.rol !== 'PROFESOR' ||
      actor.institucionId !== institucionId ||
      miembro?.institucionId !== institucionId ||
      (!docente && miembro.rol !== 'PROPIETARIO')
    ) {
      throw new ForbiddenException(
        'No tienes autorización para gestionar estas cuentas.',
      );
    }
    if (
      miembro.rol !== 'PROPIETARIO' &&
      !(await tx.asignacionLicenciaInstitucional.findFirst({
        where: {
          institucionId,
          usuarioId: actorId,
          tipo: 'DOCENTE',
          estado: 'ACTIVA',
        },
      }))
    )
      throw new ForbiddenException(
        'El docente ya no tiene una asignación activa.',
      );
    return {
      propietario: miembro.rol === 'PROPIETARIO',
      miembroId: miembro.id,
    };
  }

  private async bloquear(tx: Tx, institucionId: string) {
    const filas = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "Institucion" WHERE id = ${institucionId}::uuid FOR UPDATE`;
    if (!filas.length)
      throw new NotFoundException('Institución no encontrada.');
    if (
      !(await tx.controlLicenciaInstitucional.findUnique({
        where: { institucionId },
      }))
    )
      throw new ForbiddenException(
        'La institución no utiliza contratos LIC-1.',
      );
    const [reloj] = await tx.$queryRaw<
      { ahora: Date }[]
    >`SELECT clock_timestamp() AS ahora`;
    return reloj.ahora;
  }

  private async ejecutar(
    actorId: string,
    institucionId: string,
    operacionId: string,
    tipo: string,
    comando: object,
    trabajo: (tx: Tx, ahora: Date) => Promise<Entrega>,
    opciones: { docente?: boolean; soloAdmin?: boolean } = {},
  ) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const ahora = await this.bloquear(tx, institucionId);
          await this.autorizar(
            tx,
            actorId,
            institucionId,
            opciones.docente,
            opciones.soloAdmin,
          );
          const huella = hash({ tipo, comando });
          const previo = await tx.operacionLicenciaInstitucional.findUnique({
            where: { id: operacionId },
          });
          if (previo) {
            if (
              previo.actorId !== actorId ||
              previo.institucionId !== institucionId ||
              previo.tipo !== tipo ||
              previo.huella !== huella
            )
              throw new ConflictException(
                'Operación utilizada con otro comando.',
              );
            // The receipt intentionally cannot recover a delivered password.
            return {
              ...(previo.resultado as object),
              repetida: true,
              credenciales: [],
            };
          }
          const entrega = await trabajo(tx, ahora);
          await tx.operacionLicenciaInstitucional.create({
            data: {
              id: operacionId,
              actorId,
              institucionId,
              tipo,
              huella,
              resultado: entrega.resultado,
            },
          });
          await tx.auditoriaInstitucion.create({
            data: {
              actorId,
              institucionId,
              accion: tipo,
              ...(typeof entrega.resultado.usuarioId === 'string'
                ? { afectadoId: entrega.resultado.usuarioId }
                : {}),
              detalle: { operacionId, ...entrega.resultado },
            },
          });
          return {
            ...entrega.resultado,
            repetida: false,
            ...(entrega.credenciales
              ? { credenciales: entrega.credenciales }
              : {}),
          };
        },
        { timeout: 30000, maxWait: 15000 },
      );
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(e.code)
      )
        throw new ConflictException(
          'Identificador ocupado o conflicto concurrente. Revisa y reintenta la misma operación.',
        );
      throw e;
    }
  }

  async consultarSufijo(actorId: string, institucionId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.autorizar(tx, actorId, institucionId);
      return tx.sufijoInstitucional.findUnique({ where: { institucionId } });
    });
  }

  async contexto(actorId: string, institucionId: string) {
    return this.prisma.$transaction(async (tx) => {
      const permiso = await this.autorizar(tx, actorId, institucionId, true);
      const actor = await tx.usuario.findUniqueOrThrow({
        where: { id: actorId },
        select: { rol: true },
      });
      return {
        institucionId,
        puedeImportar: permiso.propietario,
        puedeAprobar: actor.rol === 'ADMIN',
      };
    });
  }

  async grupos(actorId: string, institucionId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.autorizar(tx, actorId, institucionId);
      return tx.clase.findMany({
        where: { institucionId },
        select: { id: true, nombre: true, grado: true },
        orderBy: { nombre: 'asc' },
      });
    });
  }

  async alumnos(actorId: string, institucionId: string, pagina: number) {
    if (!Number.isInteger(pagina) || pagina < 1 || pagina > 10000)
      throw new BadRequestException('Página inválida.');
    return this.prisma.$transaction(async (tx) => {
      const permiso = await this.autorizar(tx, actorId, institucionId, true);
      const filas = await tx.usuario.findMany({
        where: {
          institucionId,
          rol: 'ESTUDIANTE',
          origenGestionadoLicencia: { institucionId },
          ...(!permiso.propietario
            ? {
                ClaseEstudiante: {
                  some: {
                    Clase: {
                      institucionId,
                      profesores: { some: { miembroId: permiso.miembroId } },
                    },
                  },
                },
              }
            : {}),
        },
        select: {
          id: true,
          nombre: true,
          identificadorInstitucional: true,
          debeCambiarContrasena: true,
        },
        orderBy: { id: 'asc' },
        skip: (pagina - 1) * 20,
        take: 21,
      });
      return {
        items: filas.slice(0, 20),
        pagina,
        tieneSiguiente: filas.length > 20,
      };
    });
  }

  solicitarSufijo(
    actorId: string,
    institucionId: string,
    operacionId: string,
    valor: string,
  ) {
    const sufijo = normalizarSufijoInstitucional(valor);
    return this.ejecutar(
      actorId,
      institucionId,
      operacionId,
      'LIC2_SOLICITAR_SUFIJO',
      { sufijo },
      async (tx, ahora) => {
        const actual = await tx.sufijoInstitucional.findUnique({
          where: { institucionId },
        });
        if (actual?.aprobado)
          throw new ConflictException(
            'El sufijo aprobado no se cambia mediante una nueva solicitud.',
          );
        const solicitud = await tx.sufijoInstitucional.upsert({
          where: { institucionId },
          create: { institucionId, solicitado: sufijo, solicitadoEn: ahora },
          update: {
            solicitado: sufijo,
            solicitadoEn: ahora,
            version: { increment: 1 },
          },
        });
        return {
          resultado: {
            solicitado: solicitud.solicitado,
            version: solicitud.version,
          },
        };
      },
    );
  }

  aprobarSufijo(
    actorId: string,
    institucionId: string,
    operacionId: string,
    valor: string,
    version: number,
  ) {
    const sufijo = normalizarSufijoInstitucional(valor);
    return this.ejecutar(
      actorId,
      institucionId,
      operacionId,
      'LIC2_APROBAR_SUFIJO',
      { sufijo, version },
      async (tx, ahora) => {
        const solicitud = await tx.sufijoInstitucional.findUnique({
          where: { institucionId },
        });
        if (
          !solicitud ||
          solicitud.version !== version ||
          solicitud.solicitado !== sufijo ||
          solicitud.aprobado
        )
          throw new ConflictException(
            'La solicitud cambió o ya fue aprobada; vuelve a consultarla.',
          );
        await tx.sufijoInstitucional.update({
          where: { institucionId },
          data: { aprobado: sufijo, aprobadoEn: ahora },
        });
        return { resultado: { aprobado: sufijo, version } };
      },
      { soloAdmin: true },
    );
  }

  private async preparar(
    tx: Tx,
    institucionId: string,
    comando: ImportacionGestionada,
    ahora: Date,
  ) {
    const sufijo = await tx.sufijoInstitucional.findUnique({
      where: { institucionId },
    });
    if (!sufijo?.aprobado)
      throw new ForbiddenException(
        'Solicita y aprueba el sufijo antes de crear cuentas.',
      );
    const grupo = await tx.clase.findFirst({
      where: { id: comando.claseId, institucionId },
    });
    if (!grupo) throw new NotFoundException('Grupo no encontrado.');
    const control = await tx.controlLicenciaInstitucional.findUniqueOrThrow({
      where: { institucionId },
    });
    const periodo = await tx.periodoContratoInstitucional.findFirst({
      where: { institucionId, inicio: { lte: ahora }, fin: { gt: ahora } },
    });
    if (control.suspendida || !periodo)
      throw new ForbiddenException(
        'Se requiere licencia activa para crear cuentas.',
      );
    const filas = leerCsvEstudiantesGestionados(comando.csv).map((f) => ({
      ...f,
      alias: construirAliasInstitucional(f.usuario, sufijo.aprobado),
    }));
    const existentes = await tx.identificadorLogin.findMany({
      where: { valor: { in: filas.map((f) => f.alias) } },
      select: { valor: true },
    });
    const usados = await tx.asignacionLicenciaInstitucional.count({
      where: { institucionId, tipo: 'ESTUDIANTE', estado: 'ACTIVA' },
    });
    return {
      filas,
      grupo,
      disponibles: Math.max(0, periodo.cuposEstudiantes - usados),
      conflictos: existentes.map((e) => e.valor),
      huella: hash({ filas, claseId: grupo.id, sufijo: sufijo.aprobado }),
    };
  }

  async previsualizar(
    actorId: string,
    institucionId: string,
    comando: ImportacionGestionada,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const ahora = await this.bloquear(tx, institucionId);
      await this.autorizar(tx, actorId, institucionId);
      const vista = await this.preparar(tx, institucionId, comando, ahora);
      return {
        filas: vista.filas,
        disponibles: vista.disponibles,
        conflictos: vista.conflictos,
        huella: vista.huella,
        puedeConfirmar:
          !vista.conflictos.length && vista.filas.length <= vista.disponibles,
      };
    });
  }

  async importar(
    actorId: string,
    institucionId: string,
    operacionId: string,
    comando: ImportacionGestionada,
  ) {
    // Bound CPU work before the transaction. The exact CSV is revalidated inside.
    const filas = leerCsvEstudiantesGestionados(comando.csv);
    if (!comando.huella || !/^[a-f0-9]{64}$/.test(comando.huella))
      throw new BadRequestException(
        'Previsualiza el archivo antes de confirmar.',
      );
    const comandoRecibo = {
      huella: comando.huella,
      claseId: comando.claseId,
      contenido: hash(comando.csv),
    };
    if (
      await this.prisma.operacionLicenciaInstitucional.findUnique({
        where: { id: operacionId },
      })
    ) {
      return this.ejecutar(
        actorId,
        institucionId,
        operacionId,
        'LIC2_IMPORTAR_ALUMNOS',
        comandoRecibo,
        () => Promise.reject(new ConflictException('Recibo no disponible.')),
      );
    }
    const previa = await this.previsualizar(actorId, institucionId, comando);
    if (!previa.puedeConfirmar || previa.huella !== comando.huella)
      throw new ConflictException(
        'Previsualización inválida o cupos insuficientes.',
      );
    return this.conHashAcotado(institucionId, async () => {
      const secretos: { temporal: string; hash: string }[] = [];
      for (let i = 0; i < filas.length; i++) {
        const temporal = `SP-${randomBytes(18).toString('base64url')}a1`;
        secretos.push({
          temporal,
          hash: await bcrypt.hash(temporal, BCRYPT_SALT_ROUNDS),
        });
      }
      return this.ejecutar(
        actorId,
        institucionId,
        operacionId,
        'LIC2_IMPORTAR_ALUMNOS',
        comandoRecibo,
        async (tx, ahora) => {
          const vista = await this.preparar(tx, institucionId, comando, ahora);
          if (vista.huella !== comando.huella)
            throw new ConflictException(
              'El contenido cambió; vuelve a previsualizar.',
            );
          if (vista.conflictos.length || vista.filas.length > vista.disponibles)
            throw new ConflictException(
              'Hay usuarios ocupados o no quedan cupos suficientes. No se creó ninguna cuenta.',
            );
          const credenciales: NonNullable<Entrega['credenciales']> = [];
          for (let i = 0; i < vista.filas.length; i++) {
            const fila = vista.filas[i];
            const usuarioId = randomUUID();
            await tx.usuario.create({
              data: {
                id: usuarioId,
                nombre: fila.nombre,
                correo: null,
                identificadorInstitucional: fila.alias,
                versionSesion: 1,
                contrasenaHash: secretos[i].hash,
                rol: 'ESTUDIANTE',
                institucionId,
                grado: vista.grupo.grado,
                debeCambiarContrasena: true,
                correoVerificado: false,
              },
            });
            await tx.origenGestionadoInstitucional.create({
              data: { usuarioId, institucionId },
            });
            await tx.asignacionLicenciaInstitucional.create({
              data: {
                id: randomUUID(),
                usuarioId,
                institucionId,
                tipo: 'ESTUDIANTE',
                estado: 'ACTIVA',
                aceptadaEn: ahora,
              },
            });
            await tx.claseEstudiante.create({
              data: { usuarioId, claseId: vista.grupo.id },
            });
            credenciales.push({
              usuarioId,
              usuarioInstitucional: fila.alias,
              contrasenaTemporal: secretos[i].temporal,
            });
          }
          return {
            resultado: {
              creados: credenciales.length,
              usuarios: credenciales.map((c) => ({
                usuarioId: c.usuarioId,
                usuarioInstitucional: c.usuarioInstitucional,
              })),
            },
            credenciales,
          };
        },
      );
    });
  }

  async restablecer(
    actorId: string,
    institucionId: string,
    operacionId: string,
    usuarioId: string,
  ) {
    await this.prisma.$transaction((tx) =>
      this.autorizar(tx, actorId, institucionId, true),
    );
    return this.conHashAcotado(institucionId, async () => {
      const temporal = `SP-${randomBytes(18).toString('base64url')}a1`;
      const contrasenaHash = await bcrypt.hash(temporal, BCRYPT_SALT_ROUNDS);
      return this.ejecutar(
        actorId,
        institucionId,
        operacionId,
        'LIC2_RESET_TEMPORAL',
        { usuarioId },
        async (tx, ahora) => {
          const actor = await this.autorizar(tx, actorId, institucionId, true);
          const usuario = await tx.usuario.findFirst({
            where: {
              id: usuarioId,
              rol: 'ESTUDIANTE',
              institucionId,
              origenGestionadoLicencia: { institucionId },
            },
          });
          if (!usuario?.identificadorInstitucional)
            throw new NotFoundException('Cuenta gestionada no encontrada.');
          if (
            !actor.propietario &&
            !(await tx.claseEstudiante.findFirst({
              where: {
                usuarioId,
                Clase: {
                  institucionId,
                  profesores: { some: { miembroId: actor.miembroId } },
                },
              },
            }))
          )
            throw new ForbiddenException(
              'El alumno no está en tus grupos asignados.',
            );
          const desde = new Date(ahora.getTime() - 15 * 60000);
          const recientes = await tx.auditoriaInstitucion.count({
            where: {
              institucionId,
              accion: 'LIC2_RESET_TEMPORAL',
              actorId,
              fechaCreacion: { gte: desde },
            },
          });
          const delAlumno = await tx.auditoriaInstitucion.count({
            where: {
              institucionId,
              accion: 'LIC2_RESET_TEMPORAL',
              afectadoId: usuarioId,
              fechaCreacion: { gte: desde },
            },
          });
          if (recientes >= 20 || delAlumno >= 5)
            throw new HttpException(
              'Demasiados restablecimientos. Espera antes de reintentar.',
              429,
            );
          await tx.usuario.update({
            where: { id: usuarioId },
            data: {
              contrasenaHash,
              debeCambiarContrasena: true,
              versionSesion: { increment: 1 },
              temporalConsumidaEn: null,
              tokenRecuperacion: null,
              tokenRecuperacionExpira: null,
            },
          });
          return {
            resultado: { usuarioId, restablecida: true },
            credenciales: [
              {
                usuarioId,
                usuarioInstitucional: usuario.identificadorInstitucional,
                contrasenaTemporal: temporal,
              },
            ],
          };
        },
        { docente: true },
      );
    });
  }
}

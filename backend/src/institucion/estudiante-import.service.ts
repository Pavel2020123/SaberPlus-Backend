import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '../common/constants';
import { InstitucionAccesoService } from './institucion-acceso.service';
import {
  CONTRASENA_SEGURA_MENSAJE,
  esContrasenaSegura,
} from '../common/password-policy';

@Injectable()
export class EstudianteImportService {
  constructor(
    private prisma: PrismaService,
    private institucionAcceso: InstitucionAccesoService,
  ) {}

  // Parser de CSV liviano (sin dependencias externas). Soporta comillas
  // dobles para valores con comas, saltos de línea CRLF/LF y encabezado en
  // cualquier orden. Columnas esperadas: nombre, correo, contrasena.
  private parsearCsvEstudiantes(contenidoCsv: string): {
    nombre: string;
    correo: string;
    contrasena: string;
    fila: number;
  }[] {
    const lineas = contenidoCsv
      .split(/\r\n|\n|\r/)
      .filter((linea) => linea.trim().length > 0);

    if (lineas.length === 0) {
      throw new BadRequestException('El archivo CSV está vacío.');
    }

    const parsearLinea = (linea: string): string[] => {
      const valores: string[] = [];
      let actual = '';
      let dentroDeComillas = false;

      for (let i = 0; i < linea.length; i++) {
        const caracter = linea[i];

        if (dentroDeComillas) {
          if (caracter === '"') {
            if (linea[i + 1] === '"') {
              actual += '"';
              i++;
            } else {
              dentroDeComillas = false;
            }
          } else {
            actual += caracter;
          }
        } else if (caracter === '"') {
          dentroDeComillas = true;
        } else if (caracter === ',') {
          valores.push(actual.trim());
          actual = '';
        } else {
          actual += caracter;
        }
      }
      valores.push(actual.trim());
      return valores;
    };

    const encabezado = parsearLinea(lineas[0]).map((columna) =>
      columna.trim().toLowerCase(),
    );
    const indiceNombre = encabezado.indexOf('nombre');
    const indiceCorreo = encabezado.indexOf('correo');
    const indiceContrasena = encabezado.indexOf('contrasena');

    if (indiceNombre === -1 || indiceCorreo === -1 || indiceContrasena === -1) {
      throw new BadRequestException(
        'El CSV debe tener las columnas: nombre, correo, contrasena.',
      );
    }

    return lineas.slice(1).map((linea, indice) => {
      const valores = parsearLinea(linea);
      return {
        nombre: (valores[indiceNombre] ?? '').trim(),
        correo: (valores[indiceCorreo] ?? '').trim().toLowerCase(),
        contrasena: (valores[indiceContrasena] ?? '').trim(),
        fila: indice + 2, // +2: fila 1 es el encabezado, y es base 1
      };
    });
  }

  async importarEstudiantesCsv(
    usuarioId: string,
    archivo: Express.Multer.File,
    claseId?: string,
  ) {
    const institucionId =
      await this.institucionAcceso.obtenerInstitucionIdGestionable(usuarioId);

    let grupo: { grado: 'DECIMO' | 'ONCE' } | null = null;
    if (claseId) {
      const encontrado = await this.prisma.clase.findUnique({
        where: { id: claseId },
        select: { institucionId: true, grado: true },
      });
      if (!encontrado || encontrado.institucionId !== institucionId) {
        throw new NotFoundException('Grupo no encontrado.');
      }
      grupo = encontrado;
    }

    const filas = this.parsearCsvEstudiantes(archivo.buffer.toString('utf-8'));
    if (filas.length === 0) {
      throw new BadRequestException(
        'El CSV no tiene estudiantes para importar.',
      );
    }

    const omitidos: { fila: number; correo: string; motivo: string }[] = [];
    const correosVistos = new Set<string>();
    const filasValidas: {
      nombre: string;
      correo: string;
      contrasena: string;
      fila: number;
    }[] = [];

    const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    for (const fila of filas) {
      if (!fila.nombre || !fila.correo || !fila.contrasena) {
        omitidos.push({
          fila: fila.fila,
          correo: fila.correo || '(vacío)',
          motivo: 'Faltan datos (nombre, correo o contraseña).',
        });
        continue;
      }
      if (!correoValido.test(fila.correo)) {
        omitidos.push({
          fila: fila.fila,
          correo: fila.correo,
          motivo: 'Correo con formato inválido.',
        });
        continue;
      }
      if (!esContrasenaSegura(fila.contrasena)) {
        omitidos.push({
          fila: fila.fila,
          correo: fila.correo,
          motivo: CONTRASENA_SEGURA_MENSAJE,
        });
        continue;
      }
      if (correosVistos.has(fila.correo)) {
        omitidos.push({
          fila: fila.fila,
          correo: fila.correo,
          motivo: 'Correo repetido dentro del mismo archivo.',
        });
        continue;
      }
      correosVistos.add(fila.correo);
      filasValidas.push(fila);
    }

    if (filasValidas.length > 0) {
      const existentes = await this.prisma.usuario.findMany({
        where: { correo: { in: filasValidas.map((f) => f.correo) } },
        select: { correo: true },
      });
      const correosExistentes = new Set(existentes.map((u) => u.correo));

      for (let i = filasValidas.length - 1; i >= 0; i--) {
        if (correosExistentes.has(filasValidas[i].correo)) {
          omitidos.push({
            fila: filasValidas[i].fila,
            correo: filasValidas[i].correo,
            motivo: 'Ya existe un usuario con ese correo.',
          });
          filasValidas.splice(i, 1);
        }
      }
    }

    if (filasValidas.length === 0) {
      return { creados: 0, omitidos };
    }

    // Hasheamos todas las contraseñas en paralelo ANTES de abrir la
    // transacción. Antes, bcrypt.hash (CPU-intensivo) se ejecutaba
    // secuencialmente fila por fila DENTRO de la transacción, manteniéndola
    // abierta todo ese tiempo — con CSVs grandes eso arriesga timeout de
    // transacción y bloqueo de fila prolongado. Ahora la transacción solo
    // hace los create(), que son rápidos.
    const filasConHash = await Promise.all(
      filasValidas.map(async (fila) => ({
        ...fila,
        contrasenaHash: await bcrypt.hash(fila.contrasena, BCRYPT_SALT_ROUNDS),
      })),
    );

    await this.prisma.$transaction(
      async (tx) => {
        await this.institucionAcceso.verificarCupoDisponible(
          institucionId,
          grupo?.grado ?? 'ONCE',
          undefined,
          filasConHash.length,
          tx,
        );
        for (const fila of filasConHash) {
          const nuevoEstudiante = await tx.usuario.create({
            data: {
              nombre: fila.nombre,
              correo: fila.correo,
              contrasenaHash: fila.contrasenaHash,
              rol: 'ESTUDIANTE',
              institucionId,
              debeCambiarContrasena: true,
            },
          });

          if (claseId) {
            await tx.claseEstudiante.create({
              data: { usuarioId: nuevoEstudiante.id, claseId },
            });
          }
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return { creados: filasConHash.length, omitidos };
  }
}

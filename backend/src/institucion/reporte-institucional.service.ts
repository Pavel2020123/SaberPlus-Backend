import { ForbiddenException, Injectable } from '@nestjs/common';
// PDFKit usa `export =` en este proyecto CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require('pdfkit');
import { PrismaService } from '../prisma/prisma.service';
import { AlertasRiesgoService } from './alertas-riesgo.service';
import { AnaliticaDetalladaService } from './analitica-detallada.service';
import { InstitucionAccesoService } from './institucion-acceso.service';

export interface ArchivoReporteInstitucional {
  archivo: Buffer;
  nombre: string;
  tipoContenido: string;
}

@Injectable()
export class ReporteInstitucionalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly institucionAcceso: InstitucionAccesoService,
    private readonly analiticaDetallada: AnaliticaDetalladaService,
    private readonly alertasRiesgo: AlertasRiesgoService,
  ) {}

  async generarCsv(usuarioId: string): Promise<ArchivoReporteInstitucional> {
    const datos = await this.cargarDatos(usuarioId);
    const alertas = new Map(
      datos.alertas.alertas.map((alerta) => [alerta.estudiante.id, alerta]),
    );
    const encabezados = [
      'Nombre',
      'Correo',
      'Grupos',
      'XP',
      'Simulacros',
      'Promedio',
      'Progreso (%)',
      'Area prioritaria',
      'Estado academico',
      'Nivel de riesgo',
      'Dias sin registro academico remoto',
    ];
    const filas = datos.analitica.estudiantes.map((estudiante) => {
      const alerta = alertas.get(estudiante.id);
      return [
        estudiante.nombre,
        estudiante.correo,
        estudiante.grupos.map((grupo) => grupo.nombre).join(' | '),
        estudiante.xpTotal,
        estudiante.totalSimulacros,
        this.promedioVisible(
          estudiante.totalSimulacros,
          estudiante.promedioPuntaje,
        ),
        estudiante.progresoPorcentaje,
        estudiante.areaPrioritaria ?? '',
        estudiante.estadoAcademico,
        alerta?.nivel ?? 'SIN_ALERTA',
        alerta?.actividad.diasSinActividad ?? '',
      ];
    });
    const contenido = [encabezados, ...filas]
      .map((fila) => fila.map((valor) => this.celdaCsv(valor)).join(','))
      .join('\r\n');
    await this.registrarExportacion(
      datos.membresia,
      datos.actorId,
      'CSV',
      filas.length,
    );
    return {
      archivo: Buffer.from(`\uFEFF${contenido}`, 'utf8'),
      nombre: `saberplus-analitica-${this.fechaArchivo(new Date())}.csv`,
      tipoContenido: 'text/csv; charset=utf-8',
    };
  }

  async generarPdf(usuarioId: string): Promise<ArchivoReporteInstitucional> {
    const datos = await this.cargarDatos(usuarioId);
    const archivo = await this.crearPdf(datos.analitica, datos.alertas);
    await this.registrarExportacion(
      datos.membresia,
      datos.actorId,
      'PDF',
      datos.analitica.estudiantes.length,
    );
    return {
      archivo,
      nombre: `saberplus-analitica-${this.fechaArchivo(new Date())}.pdf`,
      tipoContenido: 'application/pdf',
    };
  }

  private async cargarDatos(usuarioId: string) {
    const membresia =
      await this.institucionAcceso.obtenerMembresiaGestionable(usuarioId);
    const capacidades =
      await this.institucionAcceso.obtenerCapacidadesInstitucion(
        membresia.institucionId,
      );
    if (!capacidades.exportacionesHabilitadas) {
      throw new ForbiddenException(
        'Las exportaciones requieren el plan institucional sin anuncios.',
      );
    }
    const [analitica, alertas] = await Promise.all([
      this.analiticaDetallada.obtener(usuarioId),
      this.alertasRiesgo.obtenerAlertas(usuarioId),
    ]);
    return { membresia, actorId: usuarioId, analitica, alertas };
  }

  private async registrarExportacion(
    membresia: { institucionId: string },
    actorId: string,
    formato: 'CSV' | 'PDF',
    totalEstudiantes: number,
  ) {
    await this.prisma.auditoriaInstitucion.create({
      data: {
        institucionId: membresia.institucionId,
        actorId,
        accion: 'ANALITICA_EXPORTADA',
        detalle: { formato, totalEstudiantes },
      },
    });
  }

  private celdaCsv(valor: string | number) {
    let texto = String(valor ?? '')
      .replace(/\r?\n/g, ' ')
      .trim();
    // Evita que Excel ejecute fórmulas provenientes de nombres o correos.
    if (/^[=+\-@]/.test(texto)) texto = `'${texto}`;
    return `"${texto.replace(/"/g, '""')}"`;
  }

  private promedioVisible(total: number, promedio: number): string {
    return total === 0 ? 'Sin resultados' : String(promedio);
  }

  private crearPdf(
    analitica: Awaited<ReturnType<AnaliticaDetalladaService['obtener']>>,
    alertas: Awaited<ReturnType<AlertasRiesgoService['obtenerAlertas']>>,
  ) {
    return new Promise<Buffer>((resolve, reject) => {
      const partes: Buffer[] = [];
      const doc = new PDFDocument({ size: 'A4', margin: 44 });
      doc.on('data', (parte: Buffer | Uint8Array) =>
        partes.push(Buffer.from(parte)),
      );
      doc.on('error', reject);
      doc.on('end', () => resolve(Buffer.concat(partes)));

      doc.fontSize(20).text('SaberPlus - Analítica institucional');
      doc
        .fontSize(9)
        .fillColor('#555555')
        .text(`Generado: ${new Date().toISOString()}`)
        .text(
          `Alcance: ${analitica.alcance === 'GRUPOS_ASIGNADOS' ? 'grupos asignados' : 'institución'}`,
        );
      doc.moveDown().fillColor('#000000').fontSize(12);
      doc.text(
        `Estudiantes: ${analitica.institucion.totalEstudiantes}   Simulacros: ${analitica.institucion.totalSimulacros}`,
      );
      doc.text(
        `Promedio (escala 0-100): ${this.promedioVisible(analitica.institucion.totalSimulacros, analitica.institucion.promedioGeneral)}   En riesgo: ${alertas.resumen.enRiesgo}`,
      );

      doc.moveDown().fontSize(15).text('Áreas prioritarias');
      if (analitica.prioridades.length === 0) {
        doc.fontSize(10).text('Aún no hay evidencia suficiente.');
      } else {
        for (const prioridad of analitica.prioridades) {
          doc
            .fontSize(10)
            .text(
              `${this.etiquetaArea(prioridad.area)}: ${prioridad.estudiantes} estudiante(s)${prioridad.promedio === null ? '' : `, promedio ${prioridad.promedio}`}`,
            );
        }
      }

      doc.moveDown().fontSize(15).text('Detalle estudiantil');
      for (const estudiante of analitica.estudiantes) {
        if (doc.y > 720) doc.addPage();
        const alerta = alertas.alertas.find(
          (item) => item.estudiante.id === estudiante.id,
        );
        doc
          .fontSize(10)
          .fillColor('#000000')
          .text(`${estudiante.nombre} - ${estudiante.correo}`, {
            continued: false,
          });
        doc
          .fontSize(9)
          .fillColor('#444444')
          .text(
            `Grupos: ${estudiante.grupos.map((grupo) => grupo.nombre).join(', ') || 'Sin grupo'} | Promedio: ${this.promedioVisible(estudiante.totalSimulacros, estudiante.promedioPuntaje)} | Progreso publicado: ${estudiante.progresoPorcentaje}%`,
          )
          .text(
            `Prioridad: ${estudiante.areaPrioritaria ? this.etiquetaArea(estudiante.areaPrioritaria) : 'Sin datos'} | Riesgo: ${alerta?.nivel ?? 'SIN ALERTA'}`,
          );
        doc.moveDown(0.6);
      }
      doc.end();
    });
  }

  private etiquetaArea(area: string) {
    return area
      .toLowerCase()
      .split('_')
      .map((palabra) => palabra[0].toUpperCase() + palabra.slice(1))
      .join(' ');
  }

  private fechaArchivo(fecha: Date) {
    return fecha.toISOString().slice(0, 10);
  }
}

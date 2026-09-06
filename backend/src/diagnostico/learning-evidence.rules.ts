import { AreaIcfes, EstadoContenido } from '@prisma/client';
import { isGenericCatalogName } from '../admin/academic-classification';

export const EVIDENCE_POLICY = {
  version: 1,
  ventanaDias: 90,
  minimoPreguntasSubtema: 5,
  minimoPreguntasTema: 10,
  minimoSesiones: 2,
  minimoDias: 2,
  umbralRefuerzo: 60,
  umbralFortaleza: 80,
  zonaHoraria: 'America/Bogota',
  criterioRepeticiones: 'PRIMERA_RESPUESTA_POR_PREGUNTA_EN_VENTANA',
} as const;
export const MAX_EVIDENCE_RECORDS = 10000;

export interface EvidenceRecord {
  id: string;
  preguntaId: string;
  sesionId: string;
  area: AreaIcfes;
  fechaRespuesta: Date;
  esCorrecta: boolean;
  pregunta: {
    estadoContenido: EstadoContenido;
    subtema: {
      id: string;
      nombre: string;
      estadoContenido: EstadoContenido;
      tema: {
        id: string;
        nombre: string;
        area: AreaIcfes;
        estadoContenido: EstadoContenido;
      };
    };
  };
}

export function evidenceWindow(now: Date) {
  return new Date(now.getTime() - EVIDENCE_POLICY.ventanaDias * 86400000);
}

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: EVIDENCE_POLICY.zonaHoraria,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function summarize(
  records: EvidenceRecord[],
  minimum: number,
  partial: boolean,
) {
  const correctas = records.filter((row) => row.esCorrecta).length;
  const sesiones = new Set(records.map((row) => row.sesionId)).size;
  const dias = new Set(
    records.map((row) => dayFormatter.format(row.fechaRespuesta)),
  ).size;
  const percentage = records.length ? (correctas * 100) / records.length : 0;
  const enough =
    !partial &&
    records.length >= minimum &&
    sesiones >= EVIDENCE_POLICY.minimoSesiones &&
    dias >= EVIDENCE_POLICY.minimoDias;
  return {
    preguntasUnicas: records.length,
    correctas,
    incorrectas: records.length - correctas,
    sesiones,
    dias,
    porcentaje: Math.round(percentage * 10) / 10,
    estado: !enough
      ? 'EVIDENCIA_INSUFICIENTE'
      : percentage < EVIDENCE_POLICY.umbralRefuerzo
        ? 'POR_REFORZAR'
        : percentage >= EVIDENCE_POLICY.umbralFortaleza
          ? 'FORTALEZA'
          : 'EN_PROCESO',
  };
}

export function buildLearningEvidence(
  records: EvidenceRecord[],
  now: Date,
  partial = false,
) {
  const start = evidenceWindow(now);
  const seen = new Set<string>();
  const groups = new Map<
    string,
    {
      record: EvidenceRecord;
      rows: EvidenceRecord[];
      subthemes: Map<string, EvidenceRecord[]>;
    }
  >();
  let excluded = 0;
  let repeated = 0;
  // The first graded answer in the window is the evidence; repetitions are practice.
  const ordered = [...records].sort(
    (a, b) =>
      a.fechaRespuesta.getTime() - b.fechaRespuesta.getTime() ||
      a.id.localeCompare(b.id),
  );
  for (const row of ordered) {
    const subtheme = row.pregunta.subtema;
    const theme = subtheme.tema;
    if (
      row.fechaRespuesta < start ||
      row.fechaRespuesta > now ||
      row.area !== theme.area ||
      !subtheme.nombre.trim() ||
      !theme.nombre.trim() ||
      isGenericCatalogName(subtheme.nombre) ||
      isGenericCatalogName(theme.nombre) ||
      [
        row.pregunta.estadoContenido,
        subtheme.estadoContenido,
        theme.estadoContenido,
      ].some((state) => state !== EstadoContenido.PUBLICADO)
    ) {
      excluded++;
      continue;
    }
    if (seen.has(row.preguntaId)) {
      repeated++;
      continue;
    }
    seen.add(row.preguntaId);
    let group = groups.get(theme.id);
    if (!group) {
      group = { record: row, rows: [], subthemes: new Map() };
      groups.set(theme.id, group);
    }
    group.rows.push(row);
    const rows = group.subthemes.get(subtheme.id) ?? [];
    rows.push(row);
    group.subthemes.set(subtheme.id, rows);
  }
  return {
    version: 1,
    politica: EVIDENCE_POLICY,
    desde: start.toISOString(),
    hasta: now.toISOString(),
    parcial: partial,
    registrosExcluidos: excluded,
    repeticionesIgnoradas: repeated,
    temas: [...groups.values()]
      .map((group) => {
        const theme = group.record.pregunta.subtema.tema;
        return {
          id: theme.id,
          nombre: theme.nombre,
          area: theme.area,
          ...summarize(
            group.rows,
            EVIDENCE_POLICY.minimoPreguntasTema,
            partial,
          ),
          subtemas: [...group.subthemes.entries()]
            .map(([id, rows]) => ({
              id,
              nombre: rows[0].pregunta.subtema.nombre,
              ...summarize(
                rows,
                EVIDENCE_POLICY.minimoPreguntasSubtema,
                partial,
              ),
            }))
            .sort(
              (a, b) =>
                a.nombre.localeCompare(b.nombre, 'es') ||
                a.id.localeCompare(b.id),
            ),
        };
      })
      .sort(
        (a, b) =>
          a.area.localeCompare(b.area) ||
          a.nombre.localeCompare(b.nombre, 'es') ||
          a.id.localeCompare(b.id),
      ),
  };
}

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { EstadoContenido, Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AdminGuard } from '../auth/jwt.guard';
import { PrismaService } from '../prisma/prisma.service';
import {
  EditorNameDto,
  EditorRemovalDto,
  LessonDraftDto,
  LessonEditorController,
} from './lesson-editor.controller';
import { LessonEditorService, lessonUrl } from './lesson-editor.service';

describe('LessonEditorService', () => {
  const fixture = () => ({
    id: 's1',
    nombre: 'Regla de tres',
    temaId: 't1',
    contenido: '',
    videoUrl: null,
    imagenUrl: null,
    tipoInteractivo: null as string | null,
    datosInteractivo: null as unknown,
    estadoContenido: 'BORRADOR' as EstadoContenido,
    fechaPublicacion: null as Date | null,
    fechaActualizacion: new Date('2026-09-06T10:00:00Z'),
    _count: { preguntas: 0, progresotemas: 0, actividadesPlan: 0 },
    tema: {
      id: 't1',
      nombre: 'Proporcionalidad',
      area: 'MATEMATICAS',
      estadoContenido: 'PUBLICADO' as EstadoContenido,
    },
  });
  let row = fixture();
  let theme = {
    id: 't2',
    nombre: 'Álgebra',
    area: 'MATEMATICAS',
    estadoContenido: 'BORRADOR' as EstadoContenido,
    fechaPublicacion: null as Date | null,
    _count: { subtemas: 0 },
  };
  const tx = {
    $queryRaw: jest.fn<Promise<unknown[]>, unknown[]>(),
    subtema: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    tema: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const prisma = { ...tx, $transaction: jest.fn() };
  const service = new LessonEditorService(prisma as unknown as PrismaService);
  beforeEach(() => {
    jest.resetAllMocks();
    row = fixture();
    theme = {
      id: 't2',
      nombre: 'Álgebra',
      area: 'MATEMATICAS',
      estadoContenido: 'BORRADOR',
      fechaPublicacion: null,
      _count: { subtemas: 0 },
    };
    prisma.$transaction.mockImplementation(
      (fn: (client: typeof tx) => unknown) => fn(tx),
    );
    tx.subtema.findUnique.mockImplementation(() => Promise.resolve(row));
    tx.tema.findUnique.mockImplementation(() => Promise.resolve(theme));
    tx.subtema.findMany.mockResolvedValue([]);
    tx.tema.findMany.mockResolvedValue([]);
    tx.subtema.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(row, data);
        if (data.datosInteractivo === Prisma.DbNull)
          row.datosInteractivo = null;
        return Promise.resolve(row);
      },
    );
    tx.tema.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(theme, data);
        return Promise.resolve(theme);
      },
    );
  });
  const save = async () =>
    service.guardar(
      's1',
      (await service.detalle('subtemas', 's1')).revision,
      '# Regla de tres\nExplicación',
      '',
      '',
    );

  it.each(['temas', 'subtemas'] as const)(
    'elimina solo el borrador vacío %s con bloqueo y confirmación',
    async (kind) => {
      const id = kind === 'temas' ? 't2' : 's1';
      const detail = await service.detalle(kind, id);
      expect(detail.eliminable).toBe(true);
      const result = await service.eliminar(kind, id, detail.revision, true);
      expect(result).toMatchObject({ id, tipo: kind, eliminado: true });
      expect(
        tx[kind === 'temas' ? 'tema' : 'subtema'].delete,
      ).toHaveBeenCalledWith({ where: { id } });
      expect(tx.$queryRaw.mock.calls[0][1]).toBe('editor:area:MATEMATICAS');
    },
  );
  it.each([
    'PUBLICADO',
    'ARCHIVADO',
    'EN_REVISION',
    'fecha',
    'preguntas',
    'progreso',
    'plan',
    'texto',
    'video',
    'imagen',
    'interactivo',
    'json',
    'padre',
    'generico',
  ])('bloquea eliminar un subtema protegido: %s', async (reason) => {
    if (['PUBLICADO', 'ARCHIVADO', 'EN_REVISION'].includes(reason))
      row.estadoContenido = reason as EstadoContenido;
    if (reason === 'fecha') row.fechaPublicacion = new Date();
    if (reason === 'preguntas') row._count.preguntas = 1;
    if (reason === 'progreso') row._count.progresotemas = 1;
    if (reason === 'plan') row._count.actividadesPlan = 1;
    if (reason === 'texto') row.contenido = ' '; // Even whitespace is stored content.
    if (reason === 'video')
      Object.assign(row, { videoUrl: 'https://example.com/v' });
    if (reason === 'imagen')
      Object.assign(row, { imagenUrl: 'https://example.com/i' });
    if (reason === 'interactivo') row.tipoInteractivo = 'CLOZE';
    if (reason === 'json') row.datosInteractivo = {};
    if (reason === 'padre') row.tema.estadoContenido = 'ARCHIVADO';
    if (reason === 'generico') row.nombre = 'Banco General';
    const detail = await service.detalle('subtemas', 's1');
    expect(detail.eliminable).toBe(false);
    expect(detail.motivoEliminacion).not.toBe('');
    await expect(
      service.eliminar('subtemas', 's1', detail.revision, true),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.subtema.delete).not.toHaveBeenCalled();
  });
  it('no elimina un tema con hijos ni permite confirmaciones convertidas', async () => {
    theme._count.subtemas = 1;
    const detail = await service.detalle('temas', 't2');
    await expect(
      service.eliminar('temas', 't2', detail.revision, true),
    ).rejects.toBeInstanceOf(BadRequestException);
    for (const confirmado of [false, 'true', 'false', 1, null, undefined]) {
      await expect(
        service.eliminar('temas', 't2', detail.revision, confirmado),
      ).rejects.toBeInstanceOf(BadRequestException);
      const dto = plainToInstance(
        EditorRemovalDto,
        { revision: detail.revision, confirmado },
        { enableImplicitConversion: true },
      );
      expect(validateSync(dto).length).toBeGreaterThan(0);
    }
    expect(
      validateSync(
        plainToInstance(
          EditorRemovalDto,
          { revision: detail.revision, confirmado: true },
          { enableImplicitConversion: true },
        ),
      ),
    ).toHaveLength(0);
    expect(tx.tema.delete).not.toHaveBeenCalled();
  });
  it('relee después del bloqueo e impide eliminar desde una revisión antigua', async () => {
    const detail = await service.detalle('subtemas', 's1');
    tx.$queryRaw.mockImplementation(() => {
      row._count.preguntas = 1;
      return Promise.resolve([]);
    });
    await expect(
      service.eliminar('subtemas', 's1', detail.revision, true),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.subtema.delete).not.toHaveBeenCalled();
  });

  it('expone un detalle editorial sin alumnos ni respuestas', async () => {
    const detail = await service.detalle('subtemas', 's1');
    expect(detail).toMatchObject({
      editable: true,
      renombrable: true,
      temaId: 't1',
      area: 'MATEMATICAS',
      contenido: '',
    });
    expect(detail.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(detail).not.toHaveProperty('_count');
    expect(detail).not.toHaveProperty('datosInteractivo');
  });
  const activity = {
    textoConEspacios: 'El doble de tres es ___.',
    espacios: [{ opciones: ['3', '6'], correctaIndex: 1 }],
  };
  const saveCloze = async () =>
    service.guardarCloze(
      's1',
      (await service.detalleCloze('s1')).revision,
      activity,
    );
  it('guarda CLOZE bajo los mismos bloqueos sin tocar prosa, estado o clasificación', async () => {
    row.contenido = 'Lección existente';
    const before = await service.detalleCloze('s1');
    const after = await saveCloze();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(4);
    expect(tx.$queryRaw.mock.calls[0][1]).toBe('editor:area:MATEMATICAS');
    expect(tx.$queryRaw.mock.calls[1][1]).toBe('catalogo:tema:t1');
    expect(tx.subtema.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { tipoInteractivo: 'CLOZE', datosInteractivo: activity },
    });
    expect(after).toMatchObject({
      editable: true,
      datosInteractivo: activity,
      errores: [],
      contenido: 'Lección existente',
      estadoContenido: 'BORRADOR',
    });
    expect(after.revision).not.toBe(before.revision);
    expect(after).not.toHaveProperty('_count');
  });
  it('no admite sobrescritura desde una revisión anterior de CLOZE o prosa', async () => {
    const before = await service.detalle('subtemas', 's1');
    await saveCloze();
    await expect(
      service.guardarCloze('s1', before.revision, activity),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.guardar('s1', before.revision, 'Otra', '', ''),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.subtema.update).toHaveBeenCalledTimes(1);
  });
  it('relee los datos interactivos después del bloqueo', async () => {
    const before = await service.detalleCloze('s1');
    tx.$queryRaw.mockImplementation(() => {
      row.datosInteractivo = activity;
      return Promise.resolve([]);
    });
    await expect(
      service.guardarCloze('s1', before.revision, activity),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.subtema.update).not.toHaveBeenCalled();
  });
  it.each([
    'PUBLICADO',
    'EN_REVISION',
    'ARCHIVADO',
    'publicadoAntes',
    'progreso',
    'plan',
    'padreArchivado',
    'legado',
    'otroTipo',
  ])('no guarda ni retira CLOZE protegido: %s', async (reason) => {
    row.tipoInteractivo = 'CLOZE';
    row.datosInteractivo = activity;
    if (['PUBLICADO', 'EN_REVISION', 'ARCHIVADO'].includes(reason))
      row.estadoContenido = reason as EstadoContenido;
    if (reason === 'publicadoAntes') row.fechaPublicacion = new Date();
    if (reason === 'progreso') row._count.progresotemas = 1;
    if (reason === 'plan') row._count.actividadesPlan = 1;
    if (reason === 'padreArchivado') row.tema.estadoContenido = 'ARCHIVADO';
    if (reason === 'legado') row.nombre = 'Banco General';
    if (reason === 'otroTipo') row.tipoInteractivo = 'OTRO';
    const detail = await service.detalleCloze('s1');
    expect(detail.editable).toBe(false);
    await expect(
      service.guardarCloze('s1', detail.revision, activity),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.quitarCloze('s1', detail.revision, true),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.subtema.update).not.toHaveBeenCalled();
  });
  it('permite corregir JSON heredado inválido solo si es borrador editable', async () => {
    row.tipoInteractivo = 'CLOZE';
    row.datosInteractivo = { roto: true };
    const detail = await service.detalleCloze('s1');
    expect(detail).toMatchObject({ editable: true, datosInteractivo: null });
    expect(detail.errores).toHaveLength(1);
    expect((await saveCloze()).errores).toEqual([]);
  });
  it('señala datos huérfanos y no permite ocultarlos editando solo la prosa', async () => {
    row.datosInteractivo = activity;
    expect((await service.detalleCloze('s1')).errores).toHaveLength(1);
    expect((await service.detalle('subtemas', 's1')).editable).toBe(false);
  });
  it('retira solo el ejercicio con confirmación y conserva la lección', async () => {
    row.contenido = 'Lección';
    await saveCloze();
    const detail = await service.detalleCloze('s1');
    const after = await service.quitarCloze('s1', detail.revision, true);
    expect(tx.subtema.update).toHaveBeenLastCalledWith({
      where: { id: 's1' },
      data: { tipoInteractivo: null, datosInteractivo: Prisma.DbNull },
    });
    expect(after).toMatchObject({
      contenido: 'Lección',
      tipoInteractivo: null,
      datosInteractivo: null,
      errores: [],
    });
    expect((await service.detalle('subtemas', 's1')).editable).toBe(true);
    await expect(
      service.quitarCloze('s1', detail.revision, true),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('rechaza JSON inválido y retiro no confirmado antes de abrir transacción', async () => {
    await expect(
      service.guardarCloze('s1', 'revision', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.quitarCloze('s1', 'revision', 'true'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('enruta las tres operaciones CLOZE al servicio administrativo', async () => {
    const controller = new LessonEditorController(service);
    const detail = await controller.cloze('s1');
    const saved = await controller.guardarCloze('s1', {
      revision: detail.revision,
      datosInteractivo: activity,
    });
    expect(saved.datosInteractivo).toEqual(activity);
    expect(
      (
        await controller.quitarCloze('s1', {
          revision: saved.revision,
          confirmado: true,
        })
      ).tipoInteractivo,
    ).toBeNull();
  });
  it('guarda bajo bloqueo sin publicar ni modificar clasificación', async () => {
    const result = await save();
    expect(result.estadoContenido).toBe('BORRADOR');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(4);
    expect(tx.$queryRaw.mock.calls[0][1]).toBe('editor:area:MATEMATICAS');
    expect(tx.$queryRaw.mock.calls[1][1]).toBe('catalogo:tema:t1');
    expect(tx.$queryRaw.mock.invocationCallOrder[3]).toBeLessThan(
      tx.subtema.update.mock.invocationCallOrder[0],
    );
    expect(tx.subtema.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: {
        contenido: '# Regla de tres\nExplicación',
        videoUrl: null,
        imagenUrl: null,
      },
    });
  });
  it('el segundo editor no sobrescribe la primera versión guardada', async () => {
    const first = await service.detalle('subtemas', 's1');
    await save();
    await expect(
      service.guardar('s1', first.revision, 'Otro texto', '', ''),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.subtema.update).toHaveBeenCalledTimes(1);
    expect(row.contenido).toContain('Regla de tres');
  });
  it('relee después del bloqueo y detecta cambios del padre', async () => {
    const first = await service.detalle('subtemas', 's1');
    tx.$queryRaw.mockImplementation(() => {
      row.tema.estadoContenido = 'ARCHIVADO';
      return Promise.resolve([]);
    });
    await expect(
      service.guardar('s1', first.revision, 'Texto', '', ''),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.subtema.update).not.toHaveBeenCalled();
  });
  it.each<EstadoContenido>(['PUBLICADO', 'EN_REVISION', 'ARCHIVADO'])(
    'no edita una lección %s',
    async (estado) => {
      row.estadoContenido = estado;
      await expect(save()).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.subtema.update).not.toHaveBeenCalled();
    },
  );
  it.each([
    'publicadoAntes',
    'progreso',
    'plan',
    'interactivo',
    'padreArchivado',
    'legado',
  ])('protege contenido con %s', async (reason) => {
    if (reason === 'publicadoAntes') row.fechaPublicacion = new Date();
    if (reason === 'progreso') row._count.progresotemas = 1;
    if (reason === 'plan') row._count.actividadesPlan = 1;
    if (reason === 'interactivo') row.tipoInteractivo = 'CLOZE';
    if (reason === 'padreArchivado') row.tema.estadoContenido = 'ARCHIVADO';
    if (reason === 'legado') row.tema.nombre = 'Banco General';
    await expect(save()).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.subtema.update).not.toHaveBeenCalled();
  });
  it('las preguntas impiden renombrar, no redactar una lección todavía sin uso', async () => {
    row._count.preguntas = 1;
    const detail = await service.detalle('subtemas', 's1');
    expect(detail).toMatchObject({ editable: true, renombrable: false });
    await expect(
      service.renombrar('subtemas', 's1', detail.revision, 'Otro'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('corrige nombres normalizados sin mover el subtema de área o padre', async () => {
    const detail = await service.detalle('subtemas', 's1');
    await service.renombrar(
      'subtemas',
      's1',
      detail.revision,
      '  Proporción   directa  ',
    );
    expect(tx.subtema.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { nombre: 'Proporción directa' },
    });
  });
  it('rechaza nombres duplicados incluso con variaciones de tildes', async () => {
    tx.subtema.findMany.mockResolvedValue([{ nombre: 'Proporción directa' }]);
    const detail = await service.detalle('subtemas', 's1');
    await expect(
      service.renombrar(
        'subtemas',
        's1',
        detail.revision,
        'PROPORCION DIRECTA',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.subtema.update).not.toHaveBeenCalled();
  });
  it('solo renombra temas vacíos, borradores y nunca publicados', async () => {
    let detail = await service.detalle('temas', 't2');
    await service.renombrar('temas', 't2', detail.revision, 'Álgebra básica');
    expect(tx.tema.update).toHaveBeenCalledWith({
      where: { id: 't2' },
      data: { nombre: 'Álgebra básica' },
    });
    theme._count.subtemas = 1;
    detail = await service.detalle('temas', 't2');
    expect(detail.renombrable).toBe(false);
    await expect(
      service.renombrar('temas', 't2', detail.revision, 'Otro'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each([
    'http://example.com',
    'javascript:alert(1)',
    'data:text/html,test',
    'https://user:secret@example.com',
    'https://example.com/a b',
    'x'.repeat(2001),
  ])('rechaza URL insegura %s', (value) => {
    expect(() => lessonUrl(value)).toThrow(BadRequestException);
  });
  it('admite referencias HTTPS y vacío explícito', () => {
    expect(lessonUrl('')).toBeNull();
    expect(lessonUrl('https://example.com/imagen.png')).toBe(
      'https://example.com/imagen.png',
    );
  });
  it('valida longitud y caracteres nulos antes de escribir', async () => {
    for (const text of ['x'.repeat(30001), '\u0000'])
      await expect(
        service.guardar('s1', 'revision', text, '', ''),
      ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('devuelve 404 si el registro ya no existe', async () => {
    tx.subtema.findUnique.mockResolvedValue(null);
    await expect(service.detalle('subtemas', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
  it('exige guard ADMIN y un DTO completo con revisión', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, LessonEditorController),
    ).toEqual([AdminGuard]);
    expect(
      validateSync(plainToInstance(LessonDraftDto, {})).length,
    ).toBeGreaterThan(0);
    expect(
      validateSync(
        plainToInstance(LessonDraftDto, {
          revision: 'a'.repeat(64),
          contenido: '',
          imagenUrl: '',
          videoUrl: '',
        }),
      ),
    ).toHaveLength(0);
    expect(
      validateSync(
        plainToInstance(EditorNameDto, { revision: 'old', nombre: 'Nombre' }),
      ).length,
    ).toBeGreaterThan(0);
  });
});

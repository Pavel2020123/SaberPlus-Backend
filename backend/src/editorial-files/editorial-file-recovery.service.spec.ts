import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  EditorialFileRecoveryService,
  EditorialBytesBackup,
} from './editorial-file-recovery.service';
import { EditorialFileStore } from './editorial-file.store';
import { EditorialFileService } from './editorial-file.service';
import { EditorialFileRuntime } from './editorial-file-runtime';
import { sha256 } from './editorial-image';

const id = '2df4f385-fec2-4cb1-89af-91f67a476b52';
const bytes = Buffer.from('synthetic normalized image');
describe('local editorial recovery operations', () => {
  const oldFiles = process.env.EDITORIAL_FILES_LOCAL_ENABLED,
    oldOps = process.env.EDITORIAL_FILE_OPERATIONS_LOCAL_ENABLED;
  let row: {
    id: string;
    estado: 'DISPONIBLE' | 'PREPARADO' | 'RETIRADO';
    bytes: number;
    sha256: string;
    actualizadoEn: Date;
    revocacion: { archivoId: string } | null;
  };
  let service: EditorialFileRecoveryService;
  let records: Map<string, Buffer>;
  const user = jest.fn(),
    find = jest.fn(),
    page = jest.fn(),
    put = jest.fn(),
    read = jest.fn(),
    retire = jest.fn();
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.EDITORIAL_FILES_LOCAL_ENABLED = 'true';
    process.env.EDITORIAL_FILE_OPERATIONS_LOCAL_ENABLED = 'true';
    row = {
      id,
      estado: 'DISPONIBLE',
      bytes: bytes.length,
      sha256: sha256(bytes),
      actualizadoEn: new Date('2026-11-01T00:00:00Z'),
      revocacion: null,
    };
    records = new Map([[id, bytes]]);
    user.mockResolvedValue({
      rol: 'ADMIN',
      correoVerificado: true,
      debeCambiarContrasena: false,
    });
    find.mockImplementation(() => Promise.resolve({ ...row }));
    page.mockImplementation(() => Promise.resolve([{ ...row }]));
    read.mockImplementation((key: string) => {
      const value = records.get(key);
      if (!value) throw new ServiceUnavailableException();
      return Promise.resolve(value);
    });
    put.mockImplementation((key: string, value: Buffer) => {
      if (records.has(key) && !records.get(key).equals(value))
        throw new ConflictException();
      records.set(key, Buffer.from(value));
      return Promise.resolve();
    });
    retire.mockResolvedValue({ id, estado: 'RETIRADO' });
    service = new EditorialFileRecoveryService(
      {
        usuario: { findUnique: user },
        archivoEditorial: { findUnique: find, findMany: page },
      } as unknown as PrismaService,
      { read, put } as unknown as EditorialFileStore,
      { retire } as unknown as EditorialFileService,
      new EditorialFileRuntime(),
    );
  });
  afterEach(() => {
    if (oldFiles === undefined)
      delete process.env.EDITORIAL_FILES_LOCAL_ENABLED;
    else process.env.EDITORIAL_FILES_LOCAL_ENABLED = oldFiles;
    if (oldOps === undefined)
      delete process.env.EDITORIAL_FILE_OPERATIONS_LOCAL_ENABLED;
    else process.env.EDITORIAL_FILE_OPERATIONS_LOCAL_ENABLED = oldOps;
  });
  it('is disabled by default without reading accounts, objects or backups', async () => {
    delete process.env.EDITORIAL_FILE_OPERATIONS_LOCAL_ENABLED;
    await expect(service.backup('operator', id)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(user).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { rol: 'ESTUDIANTE', correoVerificado: true },
    { rol: 'ADMIN', correoVerificado: false },
    { rol: 'ADMIN', correoVerificado: true, debeCambiarContrasena: true },
  ])('rejects an unauthorized operator without object IO', async (actor) => {
    user.mockResolvedValue(actor);
    await expect(service.audit('operator')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(page).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
  it('reports integrity without changing data or permission state', async () => {
    expect(await service.audit('operator')).toEqual({
      items: [
        {
          id,
          estado: 'DISPONIBLE',
          integridad: 'INTEGRO',
          bytes: bytes.length,
        },
      ],
      next: null,
    });
    expect(put).not.toHaveBeenCalled();
    expect(retire).not.toHaveBeenCalled();
  });
  it('does not claim a missing object when the provider is unavailable', async () => {
    read.mockRejectedValue(new ServiceUnavailableException());
    expect((await service.audit('operator')).items[0].integridad).toBe(
      'NO_VERIFICABLE',
    );
  });
  it('reports corruption without trying to replace or delete it', async () => {
    records.set(id, Buffer.from('corrupted'));
    expect((await service.audit('operator')).items[0].integridad).toBe(
      'CORRUPTO',
    );
    expect(put).not.toHaveBeenCalled();
    expect(retire).not.toHaveBeenCalled();
    await expect(service.backup('operator', id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  it('paginates conservatively and bounds page size', async () => {
    page.mockResolvedValue([
      { ...row },
      { ...row, id: 'ffffffff-fec2-4cb1-89af-91f67a476b52' },
    ]);
    expect((await service.audit('operator', undefined, 1)).next).toBe(id);
    await expect(service.audit('operator', undefined, 51)).rejects.toThrow();
  });
  it('recovers exactly the verified bytes of an existing row without republishing', async () => {
    const backup = await service.backup('operator', id);
    records.delete(id);
    expect(await service.restore('operator', id, backup)).toEqual({
      id,
      estado: 'DISPONIBLE',
      bytesVerificados: bytes.length,
    });
    expect(records.get(id)).toEqual(bytes);
  });
  it('restoring a prepared object leaves it prepared and restoring revoked bytes leaves denial intact', async () => {
    const backup = await service.backup('operator', id);
    row.estado = 'PREPARADO';
    expect((await service.restore('operator', id, backup)).estado).toBe(
      'PREPARADO',
    );
    row.revocacion = { archivoId: id };
    expect((await service.restore('operator', id, backup)).estado).toBe(
      'REVOCADO',
    );
    expect(row.revocacion).not.toBeNull();
  });
  it.each([
    { id: 'ffffffff-fec2-4cb1-89af-91f67a476b52' },
    { bytes: -1 },
    { sha256: '0'.repeat(64) },
    { base64: 'not-a-backup' },
  ])(
    'rejects a backup from another identity or with altered data',
    async (change) => {
      const backup = { ...(await service.backup('operator', id)), ...change };
      await expect(service.restore('operator', id, backup)).rejects.toThrow();
      expect(put).not.toHaveBeenCalled();
    },
  );
  it('an existing different object is never overwritten by recovery', async () => {
    const backup = await service.backup('operator', id);
    records.set(id, Buffer.from('other bytes'));
    await expect(
      service.restore('operator', id, backup),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(records.get(id)).toEqual(Buffer.from('other bytes'));
  });
  it('refuses restoring a retired row and refuses cleaning a revoked row', async () => {
    const backup = await service.backup('operator', id);
    row.estado = 'RETIRADO';
    await expect(
      service.restore('operator', id, backup),
    ).rejects.toBeInstanceOf(ConflictException);
    row.revocacion = { archivoId: id };
    await expect(service.cleanupRetired('operator', id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(put).not.toHaveBeenCalled();
    expect(retire).not.toHaveBeenCalled();
  });
  it('cleanup delegates to the existing reference-checked retirement, not raw delete', async () => {
    await expect(service.cleanupRetired('operator', id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    row.estado = 'RETIRADO';
    await service.cleanupRetired('operator', id);
    expect(retire).toHaveBeenCalledWith(id);
  });
  it('a concurrent retirement prevails and reuses existing cleanup guards', async () => {
    const backup: EditorialBytesBackup = await service.backup('operator', id);
    put.mockImplementation(() => {
      row.estado = 'RETIRADO';
      return Promise.resolve();
    });
    await expect(
      service.restore('operator', id, backup),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(retire).toHaveBeenCalledWith(id);
  });
  it('rechecks operator authorization before returning a backup', async () => {
    user
      .mockResolvedValueOnce({ rol: 'ADMIN', correoVerificado: true })
      .mockResolvedValueOnce(null);
    await expect(service.backup('operator', id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

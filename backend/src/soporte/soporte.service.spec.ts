import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SoporteService } from './soporte.service';

describe('SoporteService', () => {
  const configuracionRepositorio = {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  };
  const prisma = {
    configuracionSoporte: configuracionRepositorio,
  } as unknown as PrismaService;
  const service = new SoporteService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('construye un enlace real de WhatsApp con el mensaje codificado', async () => {
    configuracionRepositorio.findUnique.mockResolvedValue({
      id: 'principal',
      numeroWhatsapp: '573001234567',
      mensajeWhatsapp: 'Hola, necesito ayuda.',
      activo: true,
    });

    await expect(service.obtenerPublica()).resolves.toEqual({
      activo: true,
      numeroWhatsapp: '573001234567',
      mensajeWhatsapp: 'Hola, necesito ayuda.',
      whatsappUrl:
        'https://wa.me/573001234567?text=Hola%2C%20necesito%20ayuda.',
    });
  });

  it('normaliza espacios, simbolos y guiones al guardar el numero', async () => {
    configuracionRepositorio.findUnique.mockResolvedValue({
      numeroWhatsapp: null,
      mensajeWhatsapp: 'Mensaje anterior',
      activo: false,
    });
    configuracionRepositorio.upsert.mockResolvedValue({ id: 'principal' });

    await service.actualizar({
      numeroWhatsapp: '+57 300-123-4567',
      mensajeWhatsapp: 'Hola desde SaberPlus',
      activo: true,
    });

    expect(configuracionRepositorio.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        update: {
          numeroWhatsapp: '573001234567',
          mensajeWhatsapp: 'Hola desde SaberPlus',
          activo: true,
        },
      }),
    );
  });

  it('no permite activar soporte sin un numero valido', async () => {
    configuracionRepositorio.findUnique.mockResolvedValue({
      numeroWhatsapp: null,
      mensajeWhatsapp: 'Hola',
      activo: false,
    });

    await expect(service.actualizar({ activo: true })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

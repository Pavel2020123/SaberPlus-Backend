import { PrismaService } from '../prisma/prisma.service';
import { CertificadoLogroService } from './certificado-logro.service';
import { GamificacionService } from './gamificacion.service';

describe('CertificadoLogroService', () => {
  const usuario = { findUnique: jest.fn() };
  const prisma = { usuario } as unknown as PrismaService;
  const gamificacion = {
    obtenerLogroDesbloqueado: jest.fn(),
  } as unknown as GamificacionService;
  const service = new CertificadoLogroService(prisma, gamificacion);

  beforeEach(() => {
    jest.clearAllMocks();
    usuario.findUnique.mockResolvedValue({ nombre: 'Laura Martínez' });
    (gamificacion.obtenerLogroDesbloqueado as jest.Mock).mockResolvedValue({
      id: 'PRIMER_PASO',
      titulo: 'Primer paso',
      descripcion: 'Responde tu primera pregunta.',
      desbloqueado: true,
    });
  });

  it('genera un PDF descargable para un logro desbloqueado', async () => {
    const resultado = await service.generar('usuario-1', 'PRIMER_PASO');

    expect(resultado.nombre).toBe('certificado-primer-paso.pdf');
    expect(resultado.archivo.subarray(0, 4).toString()).toBe('%PDF');
    expect(resultado.archivo.length).toBeGreaterThan(1000);
  });
});

import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const CONFIGURACION_ID = 'principal';
const MENSAJE_PREDETERMINADO = 'Hola, necesito ayuda con SaberPlus.';

interface ActualizarSoporte {
  numeroWhatsapp?: string;
  mensajeWhatsapp?: string;
  activo?: boolean;
}

@Injectable()
export class SoporteService {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerPublica() {
    const configuracion = await this.obtenerRegistro();
    const activo =
      configuracion.activo && Boolean(configuracion.numeroWhatsapp);

    return {
      activo,
      numeroWhatsapp: activo ? configuracion.numeroWhatsapp : null,
      mensajeWhatsapp: configuracion.mensajeWhatsapp,
      whatsappUrl:
        activo && configuracion.numeroWhatsapp
          ? this.crearUrl(
              configuracion.numeroWhatsapp,
              configuracion.mensajeWhatsapp,
            )
          : null,
    };
  }

  obtenerAdmin() {
    return this.obtenerRegistro();
  }

  async actualizar(datos: ActualizarSoporte) {
    const actual = await this.obtenerRegistro();
    const numeroWhatsapp =
      datos.numeroWhatsapp === undefined
        ? actual.numeroWhatsapp
        : this.normalizarNumero(datos.numeroWhatsapp);
    const mensajeWhatsapp =
      datos.mensajeWhatsapp === undefined
        ? actual.mensajeWhatsapp
        : datos.mensajeWhatsapp.trim();
    const activo = datos.activo ?? actual.activo;

    if (!mensajeWhatsapp) {
      throw new BadRequestException(
        'El mensaje de soporte no puede estar vacío.',
      );
    }
    if (activo && !numeroWhatsapp) {
      throw new BadRequestException(
        'Guarda un número de WhatsApp antes de activar el soporte.',
      );
    }

    return this.prisma.configuracionSoporte.upsert({
      where: { id: CONFIGURACION_ID },
      create: {
        id: CONFIGURACION_ID,
        numeroWhatsapp,
        mensajeWhatsapp,
        activo,
      },
      update: { numeroWhatsapp, mensajeWhatsapp, activo },
    });
  }

  private async obtenerRegistro() {
    const configuracion = await this.prisma.configuracionSoporte.findUnique({
      where: { id: CONFIGURACION_ID },
    });
    if (configuracion) return configuracion;

    return this.prisma.configuracionSoporte.upsert({
      where: { id: CONFIGURACION_ID },
      create: {
        id: CONFIGURACION_ID,
        mensajeWhatsapp: MENSAJE_PREDETERMINADO,
      },
      update: {},
    });
  }

  private normalizarNumero(numero: string) {
    if (!numero.trim()) return null;
    const normalizado = numero.replace(/\D/g, '');
    if (!/^[1-9]\d{9,14}$/.test(normalizado)) {
      throw new BadRequestException(
        'Escribe el número con indicativo de país, usando entre 10 y 15 dígitos.',
      );
    }
    return normalizado;
  }

  private crearUrl(numero: string, mensaje: string) {
    return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
  }
}

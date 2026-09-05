import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { LineaInteres } from '@prisma/client';

interface DatosLeadVentas {
  nombreColegio: string;
  nombreContacto: string;
  correo: string;
  telefono?: string;
  ciudad?: string;
  linea: LineaInteres;
  plan: string;
  numeroEstudiantesAprox?: number;
  mensaje?: string;
}

@Injectable()
export class VentasService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  // ─── PÚBLICO: botón "Hablar con ventas" de /planes (Colegio) ────
  // Punto 11 del roadmap: esto SOLO recolecta el contacto — el trato
  // (cuántos estudiantes, a qué precio) se sigue cerrando por fuera.
  // Lo que gana el negocio es dejar de depender del mailto y tener el
  // lead guardado, listo para cuando el admin cree la institución
  // manualmente desde el panel (punto 12).
  async crearLead(datos: DatosLeadVentas) {
    const lead = await this.prisma.leadVentas.create({
      data: {
        ...datos,
        nombreColegio: datos.nombreColegio.trim(),
        nombreContacto: datos.nombreContacto.trim(),
        correo: datos.correo.trim().toLowerCase(),
        telefono: datos.telefono?.trim() || undefined,
        ciudad: datos.ciudad?.trim() || undefined,
        mensaje: datos.mensaje?.trim() || undefined,
      },
    });

    // No tumbamos la petición si el correo de aviso falla: el lead ya
    // quedó guardado y el admin también puede verlo en el panel.
    await this.mailService.enviarNotificacionNuevoLead(lead);

    return { ok: true, id: lead.id };
  }

  // ─── ADMIN ────────────────────────────────────────────────────
  async listar(atendido?: boolean) {
    return this.prisma.leadVentas.findMany({
      where: atendido === undefined ? undefined : { atendido },
      orderBy: { fechaCreacion: 'desc' },
    });
  }

  async marcarAtendido(id: string, atendido: boolean) {
    return this.prisma.leadVentas.update({
      where: { id },
      data: { atendido },
    });
  }
}

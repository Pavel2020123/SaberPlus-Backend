import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  private escaparHtml(valor: string | number | null | undefined) {
    return String(valor ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async enviarVerificacionCorreo(
    correo: string,
    nombre: string,
    token: string,
  ) {
    const url = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/verificar-correo?token=${encodeURIComponent(token)}`;
    const nombreSeguro = this.escaparHtml(nombre);

    try {
      await this.transporter.sendMail({
        from: process.env.MAIL_FROM || '"SaberPlus" <no-reply@saberplus.app>',
        to: correo,
        subject: 'Confirma tu correo — SaberPlus',
        html: `
          <p>Hola ${nombreSeguro},</p>
          <p>Gracias por registrarte en SaberPlus. Confirma tu correo para activar tu cuenta:</p>
          <p><a href="${url}">Confirmar mi correo</a></p>
          <p>Si no fuiste tú, ignora este mensaje.</p>
        `,
      });
    } catch (error) {
      // No tumbamos el registro si el envío falla; el usuario puede pedir
      // el reenvío desde /auth/reenviar-verificacion.
      this.logger.error(
        `No se pudo enviar el correo de verificación a ${correo}`,
        error as Error,
      );
    }
  }

  async enviarRecuperacionContrasena(
    correo: string,
    nombre: string,
    token: string,
  ) {
    const url = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/restablecer-contrasena?token=${encodeURIComponent(token)}`;
    const nombreSeguro = this.escaparHtml(nombre);

    try {
      await this.transporter.sendMail({
        from: process.env.MAIL_FROM || '"SaberPlus" <no-reply@saberplus.app>',
        to: correo,
        subject: 'Recupera tu contraseña — SaberPlus',
        html: `
          <p>Hola ${nombreSeguro},</p>
          <p>Recibimos una solicitud para restablecer tu contraseña. Este enlace vence en 1 hora:</p>
          <p><a href="${url}">Elegir una nueva contraseña</a></p>
          <p>Si no fuiste tú, ignora este mensaje: tu contraseña actual sigue funcionando.</p>
        `,
      });
    } catch (error) {
      // No revelamos si el envío falló al frontend; el mensaje siempre
      // es genérico para no filtrar qué correos existen.
      this.logger.error(
        `No se pudo enviar el correo de recuperación a ${correo}`,
        error as Error,
      );
    }
  }

  // Punto 11 del roadmap: aviso interno cuando un director de colegio
  // llena el formulario "Hablar con ventas". No es correo transaccional
  // para el lead — el lead no recibe nada, solo el equipo de ventas.
  async enviarNotificacionNuevoLead(lead: {
    id: string;
    nombreColegio: string;
    nombreContacto: string;
    correo: string;
    telefono?: string | null;
    ciudad?: string | null;
    linea: string;
    plan: string;
    numeroEstudiantesAprox?: number | null;
    mensaje?: string | null;
  }) {
    const correoDestino =
      process.env.VENTAS_NOTIFICACION_CORREO || 'ventas@saberplus.app';
    const valor = (dato: string | number | null | undefined, respaldo = '—') =>
      this.escaparHtml(dato || respaldo);
    const asuntoColegio = lead.nombreColegio.replace(/[\r\n]+/g, ' ').trim();

    try {
      await this.transporter.sendMail({
        from: process.env.MAIL_FROM || '"SaberPlus" <no-reply@saberplus.app>',
        to: correoDestino,
        subject: `Nuevo lead: ${asuntoColegio} — ${lead.linea} ${lead.plan}`,
        html: `
          <p>Nuevo colegio interesado en un plan institucional.</p>
          <ul>
            <li><strong>Colegio:</strong> ${valor(lead.nombreColegio)}</li>
            <li><strong>Contacto:</strong> ${valor(lead.nombreContacto)}</li>
            <li><strong>Correo:</strong> ${valor(lead.correo)}</li>
            <li><strong>Teléfono:</strong> ${valor(lead.telefono)}</li>
            <li><strong>Ciudad:</strong> ${valor(lead.ciudad)}</li>
            <li><strong>Línea / plan:</strong> ${valor(lead.linea)} ${valor(lead.plan)}</li>
            <li><strong>Estudiantes aprox.:</strong> ${valor(lead.numeroEstudiantesAprox)}</li>
            <li><strong>Mensaje:</strong> ${valor(lead.mensaje)}</li>
          </ul>
          <p>ID del lead: ${valor(lead.id)}</p>
        `,
      });
    } catch (error) {
      // No tumbamos la creación del lead si el correo de aviso falla:
      // el admin igual puede verlo en /ventas/admin.
      this.logger.error(
        `No se pudo enviar el aviso de nuevo lead (${lead.id})`,
        error as Error,
      );
    }
  }
}

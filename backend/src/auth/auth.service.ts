import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '../common/constants';
import {
  calcularFechaVencimientoPrueba,
  planEstudianteVencido,
} from './plan.util';
import {
  generarTokenVerificacion,
  calcularExpiracionToken,
  requiereVerificacionCorreo,
} from './verificacion.util';
import {
  generarTokenRecuperacion,
  calcularExpiracionTokenRecuperacion,
} from './recuperacion.util';
import { MailService } from '../mail/mail.service';
import { ReferidosService } from '../referidos/referidos.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mailService: MailService,
    private referidosService: ReferidosService,
  ) {}

  // ─── REGISTRO ───────────────────────────────────────────────
  async registrarEstudiante(
    nombre: string,
    correo: string,
    contrasena: string,
    codigoReferido?: string,
  ) {
    return this.registrarCuenta(
      nombre,
      correo,
      contrasena,
      'ESTUDIANTE',
      codigoReferido,
    );
  }

  async registrarCuenta(
    nombre: string,
    correo: string,
    contrasena: string,
    rol: 'ESTUDIANTE' | 'PROFESOR',
    codigoReferido?: string,
  ) {
    const correoNormalizado = correo.trim().toLowerCase();
    const usuarioExiste = await this.prisma.usuario.findUnique({
      where: { correo: correoNormalizado },
    });
    if (usuarioExiste)
      throw new BadRequestException('El correo ya está registrado');

    const contrasenaEncriptada = await bcrypt.hash(
      contrasena,
      BCRYPT_SALT_ROUNDS,
    );

    // La prueba gratis de 3 días YA NO arranca aquí: arranca cuando se
    // confirma el correo (verificarCorreo), para que nadie la reinicie
    // registrándose con correos falsos. Punto 7.
    const tokenVerificacion = generarTokenVerificacion();
    const tokenVerificacionExpira = calcularExpiracionToken();
    if (rol === 'PROFESOR' && codigoReferido?.trim()) {
      throw new BadRequestException(
        'Los códigos de referido están disponibles para estudiantes.',
      );
    }
    const referido =
      rol === 'ESTUDIANTE'
        ? await this.referidosService.prepararRegistro(
            codigoReferido,
            correoNormalizado,
          )
        : null;

    const nuevoUsuario = await this.prisma.usuario.create({
      data: {
        nombre: nombre.trim(),
        correo: correoNormalizado,
        contrasenaHash: contrasenaEncriptada,
        rol,
        correoVerificado: false,
        tokenVerificacion,
        tokenVerificacionExpira,
        codigoReferido: referido?.codigoNuevo ?? null,
        referidoRecibido: referido?.referidorId
          ? {
              create: {
                referidorId: referido.referidorId,
                codigoUsado: referido.codigoUsado,
              },
            }
          : undefined,
      },
    });

    await this.mailService.enviarVerificacionCorreo(
      correoNormalizado,
      nombre.trim(),
      tokenVerificacion,
    );

    return {
      mensaje: '¡Cuenta creada con éxito! Revisa tu correo para confirmarla.',
      usuarioId: nuevoUsuario.id,
      rol,
    };
  }

  // ─── VERIFICACIÓN DE CORREO ─────────────────────────────────
  async verificarCorreo(token: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { tokenVerificacion: token },
    });

    if (!usuario) {
      throw new BadRequestException('El enlace de verificación no es válido.');
    }

    if (
      usuario.tokenVerificacionExpira &&
      usuario.tokenVerificacionExpira.getTime() < Date.now()
    ) {
      throw new BadRequestException(
        'El enlace de verificación venció. Pide que te reenviemos uno nuevo.',
      );
    }

    // Aquí SÍ arranca la prueba gratis de 3 días, ya con el correo confirmado.
    const fechaVencimientoPlan =
      usuario.rol === 'ESTUDIANTE' && !usuario.institucionId
        ? calcularFechaVencimientoPrueba()
        : usuario.fechaVencimientoPlan;

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        correoVerificado: true,
        tokenVerificacion: null,
        tokenVerificacionExpira: null,
        fechaVencimientoPlan,
      },
    });

    return { mensaje: '¡Correo confirmado! Ya puedes empezar a estudiar.' };
  }

  // ─── REENVIAR VERIFICACIÓN ───────────────────────────────────
  async reenviarVerificacion(correo: string) {
    const correoNormalizado = correo.trim().toLowerCase();
    const usuario = await this.prisma.usuario.findUnique({
      where: { correo: correoNormalizado },
    });

    // Mensaje genérico: no revelamos si el correo existe o no.
    const mensajeGenerico = {
      mensaje:
        'Si el correo existe y no está verificado, te reenviamos el enlace.',
    };

    if (!usuario || usuario.correoVerificado) {
      return mensajeGenerico;
    }

    const tokenVerificacion = generarTokenVerificacion();
    const tokenVerificacionExpira = calcularExpiracionToken();

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { tokenVerificacion, tokenVerificacionExpira },
    });

    await this.mailService.enviarVerificacionCorreo(
      correoNormalizado,
      usuario.nombre,
      tokenVerificacion,
    );

    return mensajeGenerico;
  }

  // ─── SOLICITAR RECUPERACIÓN DE CONTRASEÑA ────────────────────
  async solicitarRecuperacionContrasena(correo: string) {
    const correoNormalizado = correo.trim().toLowerCase();
    const usuario = await this.prisma.usuario.findUnique({
      where: { correo: correoNormalizado },
    });

    // Mensaje genérico: no revelamos si el correo existe o no.
    const mensajeGenerico = {
      mensaje:
        'Si el correo existe, te enviamos un enlace para restablecer tu contraseña.',
    };

    if (!usuario) {
      return mensajeGenerico;
    }

    const tokenRecuperacion = generarTokenRecuperacion();
    const tokenRecuperacionExpira = calcularExpiracionTokenRecuperacion();

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: { tokenRecuperacion, tokenRecuperacionExpira },
    });

    await this.mailService.enviarRecuperacionContrasena(
      correoNormalizado,
      usuario.nombre,
      tokenRecuperacion,
    );

    return mensajeGenerico;
  }

  // ─── RESTABLECER CONTRASEÑA ───────────────────────────────────
  async restablecerContrasena(token: string, nuevaContrasena: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { tokenRecuperacion: token },
    });

    if (!usuario) {
      throw new BadRequestException('El enlace de recuperación no es válido.');
    }

    if (
      usuario.tokenRecuperacionExpira &&
      usuario.tokenRecuperacionExpira.getTime() < Date.now()
    ) {
      throw new BadRequestException(
        'El enlace de recuperación venció. Pide uno nuevo.',
      );
    }

    const contrasenaEncriptada = await bcrypt.hash(
      nuevaContrasena,
      BCRYPT_SALT_ROUNDS,
    );

    await this.prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        contrasenaHash: contrasenaEncriptada,
        tokenRecuperacion: null,
        tokenRecuperacionExpira: null,
      },
    });

    return { mensaje: 'Contraseña actualizada. Ya puedes iniciar sesión.' };
  }

  // ─── LOGIN ──────────────────────────────────────────────────
  async login(correo: string, contrasena: string) {
    const correoNormalizado = correo.trim().toLowerCase();
    // 1. Buscar el usuario por correo
    const usuario = await this.prisma.usuario.findUnique({
      where: { correo: correoNormalizado },
    });

    if (!usuario) {
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }

    // 2. Comparar la contraseña con el hash guardado
    const contrasenaValida = await bcrypt.compare(
      contrasena,
      usuario.contrasenaHash,
    );

    if (!contrasenaValida) {
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }

    // 3. Crear el JWT con la info del usuario (el "payload")
    const payload = {
      sub: usuario.id, // "sub" = subject, estándar JWT
      correo: usuario.correo,
      rol: usuario.rol,
      nombre: usuario.nombre,
      institucionId: usuario.institucionId,
    };
    const token = await this.jwtService.signAsync(payload);
    return {
      mensaje: '¡Bienvenido de vuelta!',
      accessToken: token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        correo: usuario.correo,
        rol: usuario.rol,
        xpTotal: usuario.xpTotal,
        institucionId: usuario.institucionId,
        debeCambiarContrasena: usuario.debeCambiarContrasena,
      },
    };
  }
  // ─── OBTENER PERFIL ─────────────────────────────────────────
  async obtenerPerfil(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        nombre: true,
        correo: true,
        rol: true,
        xpTotal: true,
        fechaCreacion: true,
        fotoPerfil: true,
        descripcion: true,
        institucionId: true,
        fechaVencimientoPlan: true,
        correoVerificado: true,
        debeCambiarContrasena: true,
      },
    });

    if (!usuario) return usuario;

    return {
      ...usuario,
      // Ya resuelto en el backend para que el frontend no tenga que
      // repetir la lógica de "quién queda exento del muro de pago".
      planVencido: planEstudianteVencido(usuario),
      // Igual, pero para el aviso de "confirma tu correo".
      requiereVerificacionCorreo: requiereVerificacionCorreo(usuario),
    };
  }

  // ─── ACTUALIZAR PERFIL ───────────────────────────────────────
  async actualizarPerfil(
    usuarioId: string,
    descripcion?: string,
    fotoPerfil?: string,
  ) {
    const usuario = await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: {
        ...(descripcion !== undefined && { descripcion }),
        ...(fotoPerfil !== undefined && { fotoPerfil }),
      },
      select: {
        id: true,
        nombre: true,
        correo: true,
        fotoPerfil: true,
        descripcion: true,
      },
    });
    return { mensaje: 'Perfil actualizado', usuario };
  }

  // ─── CAMBIO DE CONTRASEÑA OBLIGATORIO (punto 12) ─────────────
  // No pide la contraseña actual: el usuario ya se autenticó con el
  // JWT (con la temporal que le dio el admin), y eso ya prueba que la
  // conoce. Solo apaga la bandera para que no lo vuelva a interrumpir.
  async cambiarContrasenaInicial(usuarioId: string, nuevaContrasena: string) {
    const contrasenaEncriptada = await bcrypt.hash(
      nuevaContrasena,
      BCRYPT_SALT_ROUNDS,
    );

    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: {
        contrasenaHash: contrasenaEncriptada,
        debeCambiarContrasena: false,
      },
    });

    return { mensaje: 'Contraseña actualizada.' };
  }
}

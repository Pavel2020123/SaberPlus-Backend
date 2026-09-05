import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';
import { AuthenticatedRequest } from './auth.types';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  MinLength,
} from 'class-validator';
import {
  CONTRASENA_SEGURA_MENSAJE,
  CONTRASENA_SEGURA_REGEX,
} from '../common/password-policy';

class RegistroDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre!: string;

  @IsEmail()
  @MaxLength(254)
  correo!: string;

  @IsString()
  @Matches(CONTRASENA_SEGURA_REGEX, {
    message: CONTRASENA_SEGURA_MENSAJE,
  })
  contrasena!: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  codigoReferido?: string;

  @IsOptional()
  @IsIn(['ESTUDIANTE', 'PROFESOR'])
  rol?: 'ESTUDIANTE' | 'PROFESOR';
}

class LoginDto {
  @IsEmail()
  @MaxLength(254)
  correo!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  contrasena!: string;
}

class PerfilDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(900000)
  @Matches(
    /^(?:data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+|https?:\/\/[^\s]+|\/uploads\/[^\s]+)$/,
    { message: 'La foto de perfil no tiene un formato válido.' },
  )
  fotoPerfil?: string;
}

class VerificarCorreoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  token!: string;
}

class ReenviarVerificacionDto {
  @IsEmail()
  @MaxLength(254)
  correo!: string;
}

class SolicitarRecuperacionDto {
  @IsEmail()
  @MaxLength(254)
  correo!: string;
}

class RestablecerContrasenaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  token!: string;

  @IsString()
  @Matches(CONTRASENA_SEGURA_REGEX, {
    message: CONTRASENA_SEGURA_MENSAJE,
  })
  nuevaContrasena!: string;
}

class CambiarContrasenaInicialDto {
  @IsString()
  @Matches(CONTRASENA_SEGURA_REGEX, {
    message: CONTRASENA_SEGURA_MENSAJE,
  })
  nuevaContrasena!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('registro')
  registrar(@Body() body: RegistroDto) {
    return this.authService.registrarCuenta(
      body.nombre,
      body.correo,
      body.contrasena,
      body.rol ?? 'ESTUDIANTE',
      body.codigoReferido,
    );
  }

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body.correo, body.contrasena);
  }

  @Post('verificar-correo')
  verificarCorreo(@Body() body: VerificarCorreoDto) {
    return this.authService.verificarCorreo(body.token);
  }

  @Post('reenviar-verificacion')
  reenviarVerificacion(@Body() body: ReenviarVerificacionDto) {
    return this.authService.reenviarVerificacion(body.correo);
  }

  @Post('solicitar-recuperacion')
  solicitarRecuperacion(@Body() body: SolicitarRecuperacionDto) {
    return this.authService.solicitarRecuperacionContrasena(body.correo);
  }

  @Post('restablecer-contrasena')
  restablecerContrasena(@Body() body: RestablecerContrasenaDto) {
    return this.authService.restablecerContrasena(
      body.token,
      body.nuevaContrasena,
    );
  }

  @UseGuards(JwtGuard)
  @Get('perfil')
  obtenerPerfil(@Request() req: AuthenticatedRequest) {
    return this.authService.obtenerPerfil(req.usuario.sub);
  }

  @UseGuards(JwtGuard)
  @Patch('perfil')
  actualizarPerfil(
    @Body() body: PerfilDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.authService.actualizarPerfil(
      req.usuario.sub,
      body.descripcion,
      body.fotoPerfil,
    );
  }

  @UseGuards(JwtGuard)
  @Patch('cambiar-contrasena-inicial')
  cambiarContrasenaInicial(
    @Body() body: CambiarContrasenaInicialDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.authService.cambiarContrasenaInicial(
      req.usuario.sub,
      body.nuevaContrasena,
    );
  }
}

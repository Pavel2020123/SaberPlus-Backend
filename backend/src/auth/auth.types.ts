import { Request } from 'express';

export type RolUsuario = 'ESTUDIANTE' | 'PROFESOR' | 'ADMIN';

export interface JwtPayload {
  sub: string;
  correo: string;
  rol: RolUsuario;
  nombre: string;
  institucionId?: string;
}

export interface AuthenticatedRequest extends Request {
  usuario?: JwtPayload;
}

export const CONTRASENA_SEGURA_REGEX = /^(?=.*[A-Z])(?=.*\d).{8,72}$/;
export const CONTRASENA_SEGURA_MENSAJE =
  'La contraseña debe tener entre 8 y 72 caracteres, una mayúscula y un número.';

export function esContrasenaSegura(contrasena: string) {
  return CONTRASENA_SEGURA_REGEX.test(contrasena);
}

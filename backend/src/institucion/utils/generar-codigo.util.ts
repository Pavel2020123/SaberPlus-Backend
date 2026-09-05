// Genera un código aleatorio único con el prefijo dado, verificando su
// existencia con la función que se le pase. Un solo bucle "generar hasta
// que no exista" reutilizable para cualquier tabla que necesite un
// código único (institucion.codigoUnico, clase.codigoIngreso, etc.).
//
// Función pura (sin dependencias de Prisma ni de ningún service) para
// poder compartirla entre InstitucionService y GrupoService sin acoplarlos.
export async function generarCodigoConPrefijo(
  prefijo: string,
  existeCodigo: (codigo: string) => Promise<boolean>,
): Promise<string> {
  let codigo = '';
  let existe = true;

  while (existe) {
    codigo = `${prefijo}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    existe = await existeCodigo(codigo);
  }

  return codigo;
}

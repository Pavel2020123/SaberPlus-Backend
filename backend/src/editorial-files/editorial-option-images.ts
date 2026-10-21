import { ServiceUnavailableException } from '@nestjs/common';

// Preparación C2-B: nunca activar por recibir un campo del navegador.
// Se limita al mismo entorno desechable/local de C5 hasta cerrar consumidores C2-C.
export function optionImagesEnabled() {
  return (
    process.env.EDITORIAL_OPTION_IMAGES_LOCAL_ENABLED === 'true' &&
    process.env.EDITORIAL_FILES_LOCAL_ENABLED === 'true' &&
    ['development', 'test'].includes(process.env.NODE_ENV ?? '')
  );
}

export function requireOptionImages() {
  if (!optionImagesEnabled())
    throw new ServiceUnavailableException(
      'Las imágenes en opciones aún están en preparación. No se guardó la pregunta. Conserva tu texto.',
    );
}

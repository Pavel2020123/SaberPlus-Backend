# Retiro de pasarelas heredadas — 12 de septiembre de 2026

Se eliminó la implementación de ePayco y la compatibilidad con variables Wompi
del backend de SaberPlus. No se modificó el proyecto web Icfes_Vida.

- Eliminados servicio de cobro, creación de órdenes, validación de firmas,
  procesamiento de confirmaciones y pruebas de la integración anterior.
- Retiradas las variables de pasarela de `.env.example`.
- Las tres rutas anteriores (`POST /pagos/crear-orden`, `POST /pagos/confirmacion`
  y `GET /pagos/estado/:factura`) responden HTTP 410 con código
  `LEGACY_PAYMENTS_RETIRED`. No reciben credenciales de proveedor, consultan
  facturas, crean órdenes ni activan planes.
- `PagosModule` permanece únicamente para devolver ese aviso de retiro; no
  importa Prisma ni servicios de negocio. No es una pasarela activa.
- Tablas, datos, estados previos de planes y migraciones históricas permanecen
  intactos. Por eso puede haber menciones históricas a esos proveedores en Prisma
  o documentos anteriores: no son una integración ejecutable.

No se tocaron los cambios previos de Guardián ni los archivos reales de secretos.
Los cuatro archivos eliminados pueden recuperarse desde el historial de Git.

## Verificación

La suite `pagos-retirados.spec.ts` comprueba HTTP 410 con/sin Authorization,
confirmaciones repetidas, ausencia de datos de facturas y módulo sin proveedores
de negocio: 5 pruebas aprobadas. No se contacta ninguna pasarela o base real.

Validación local del 12 de septiembre: suite general de 65 suites / 671 pruebas
aprobadas; `npm run build` y `npx eslint src/pagos --max-warnings=0` correctos.
No quedan coincidencias de ePayco/Wompi/PagosService en `backend/src` ni en la
plantilla `.env.example`; `dist/pagos` solo contiene el módulo y controlador
de retiro compilados. Flutter tampoco tenía código de esas pasarelas.

## Despliegue pendiente

El retiro está implementado localmente; Render seguirá usando la versión anterior
hasta desplegar este cambio. No se aplican migraciones para esta entrega.
Al desplegar, verificar las tres rutas y retirar las variables `EPAYCO_*` y
`WOMPI_*` que existan en la configuración del servicio de SaberPlus. No copiar,
publicar ni borrar secretos del proyecto web ajeno a este retiro.

Si existiesen órdenes reales pendientes, conciliarlas por separado antes del
despliegue: el webhook retirado ya no actualizará su estado y no devuelve un 200
que pudiera confundirse con una confirmación procesada.

Google Play Billing sigue pendiente de implementación y validación. Este cambio
no activa compras, suscripciones ni nuevos derechos comerciales.

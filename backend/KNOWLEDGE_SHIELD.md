# JN-4B — Escudo del conocimiento

**RETIRADO, 27 de septiembre de 2026.** Documento histórico, no contrato activo.
Motor y pruebas exclusivas eliminados; rutas antiguas devuelven 410 sin Prisma.
No ejecutar comandos de juego/runner listados abajo. Se conserva migración y
modelo legado para no destruir historial; ninguna partida nueva se procesa.

Implementación local del 24 de septiembre de 2026. Sin despliegue ni migración en
Supabase/Render. El cliente Flutter sigue siendo demo; JN-4C conectará estas rutas.

## Reglas v1

Tres rondas, cuatro preguntas cada una, escudo inicial/máximo de tres puntos.
Acierto repara uno (hasta tres); error quita uno. Al cerrar cada ronda, si queda
escudo, el ataque de tinta quita otro punto. Solo sobrevivir a ese ataque entrega
una página. Escudo cero termina en DERROTA incluso en la pregunta doce.
Sobrevivir a las doce preguntas entrega tres páginas y VICTORIA.
Sin reloj de respuesta, XP, insignias, certificados ni cambios de diagnóstico.
Estas reglas provisionales coinciden con JN-4A y requieren evaluar su dificultad.

## API

Todas las rutas requieren JWT y correo verificado. El servicio verifica el rol
ESTUDIANTE en la base, no recibe usuarioId desde el cuerpo.

| Método | Ruta | Función |
| --- | --- | --- |
| POST | /escudo-conocimiento/intentos | Iniciar o recuperar el intento activo con los mismos filtros |
| GET | /escudo-conocimiento/intentos/activo | Activo propio, o null |
| GET | /escudo-conocimiento/intentos/:id | Recuperar un intento propio, incluso terminado |
| POST | /escudo-conocimiento/intentos/:id/respuestas | Confirmar respuesta actual |
| POST | /escudo-conocimiento/intentos/:id/abandonar | Cerrar sin más respuestas |

Crear acepta area (AreaIcfes), temaId/subtemaId opcionales y dificultad opcional
(Dificultad). IDs de intento UUID; filtros de tema/subtema como IDs del catálogo.
Respuesta acepta exclusivamente preguntaId, respuestaId e idempotencyKey UUID.
ValidationPipe global rechaza propiedades extra, incluyendo puntajes y propietarios.

Estado público: id, area, temaId, subtemaId, dificultad, reglas, venceEn, estado,
escudo, paginas, aciertos, errores, respondidas, pregunta y ultimaRespuesta.
Reglas: version=1, maximumShield=3, rounds=3, questionsPerRound=4, questions=12.
Estados: ACTIVO, VICTORIA, DERROTA, ABANDONADO, EXPIRADO.
pregunta es solo la actual (con opciones, área/tema/subtema, imagen y caso); al cerrar
es null. ultimaRespuesta contiene preguntaId, respuestaId, esCorrecta, escudoAntes,
escudoDespues, rondaFinalizada y paginasRecuperadas (incremento de esa respuesta).
rondaFinalizada indica haber respondido la cuarta pregunta, no haber sobrevivido.
La diferencia de escudo incluye reparación/daño y el ataque de fin de ronda.

## Integridad y privacidad

- Una partida activa por estudiante, bloqueo transaccional por usuario/juego e
  índice único parcial como segunda defensa ante concurrencia.
- Doce preguntas distintas por ID, publicadas con sus padres/caso; 2–6 opciones
  no vacías y una correcta. Caso y pregunta deben pertenecer a la misma área.
  No se repiten preguntas para llenar un banco insuficiente. No hay fallback demo.
- Muestreo paginado del banco y orden aleatorio. Snapshots privados mantienen
  la corrección original aunque se edite el catálogo después.
- El servidor calcula cada transición. No expone snapshots futuros, soluciones,
  explicaciones, claves de reintento ni identidad del propietario en el estado.
- Clave repetida con el mismo contenido devuelve el estado más reciente sin
  aplicar daño/reparación otra vez; contenido distinto: 409. Pregunta pasada o
  futura: 409. Opción ajena: 400. Intento ajeno/no existente: 404.
- Caducidad de 24 horas desde el inicio para limpiar intentos abandonados, no es
  un cronómetro de juego. Se aplica al consultar o mutar; no hay proceso periódico.
  Una respuesta al expirar devuelve EXPIRADO sin calificarla.
- Versiones desconocidas se rechazan. Intentos terminados no aceptan respuestas
  nuevas. Abandono idempotente conserva escudo y páginas confirmadas.
- Tabla con RLS sin políticas de cliente y revocación a PUBLIC, anon y
  authenticated. El acceso lo hace el backend mediante su conexión privada.

## Migración y verificación

Modelo IntentoEscudoConocimiento. Migración:
prisma/migrations/20260924160000_knowledge_shield/migration.sql.
Incluye claves, restricciones de estado/JSON/fechas y privacidad.
No se ejecutó contra una base real.

Desde backend/:

```powershell
npm run build
npx --no-install eslint "src/knowledge-shield/*.ts" --max-warnings=0
npm test -- --runInBand
node tool/test_editorial_postgres.mjs --knowledge-shield
```

Verificado: build correcto, 824 pruebas Jest (82 suites) y 21 pruebas PostgreSQL.
El runner crea su propia instancia local, usa migraciones de HEAD más únicamente
esta migración local si falta, sin cargar .env ni conexiones existentes. Verifica
propiedad y apagado antes de eliminar su directorio temporal.

Pendiente: JN-4C cliente Flutter remoto, despliegue/migración autorizados y ensayo
con banco académico real suficiente. Arte, audio y UI-F siguen para el final.

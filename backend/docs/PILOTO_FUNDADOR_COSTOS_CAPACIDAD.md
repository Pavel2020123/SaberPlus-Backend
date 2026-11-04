# Piloto fundador — presupuesto y capacidad

Continuación2/nov: [batería local extendida completada y hallazgos](PILOTO_PRUEBAS_CAPACIDAD.md).75 diagnósticos, juegos, imágenes, PDF y sockets ensayados; corrección de reenvíos concurrentes. El límite global por IP bloquea parte de la demanda escolar y algunas latencias superan el umbral candidato. Los presupuestos siguientes siguen siendo hipótesis: no equivalen a una oferta aprobada ni justifican comprar el servidor mínimo.

2/nov/2026. Hoja de trabajo, no cotización ni compra. Estrategia aprobada: entrar con precio accesible y margen pequeño; no imponer40% de margen ni depender de colegios futuros para cumplir el primer contrato. Sin gasto/servicios remotos autorizados.

## Oferta candidata, no tarifa aprobada

Una institución,75 estudiantes,3 docentes y1 propietario separado;6 meses desde fecha acordada. Ejemplo comercial2.500.000COP, equivalente a416.667COP/mes y5.556COP por cupo estudiantil/mes. El importe sigue sujeto a costos, alcance de contenido y soporte. No garantiza capacidad ni precios futuros.

No fraccionar funciones artificialmente: incluye el alcance funcional acordado, pero soporte con horario, capacitación inicial y límites de cupos definidos. Preparación de contenido, impresión, visitas presenciales o personalizaciones deben explicitarse: no prometer servicio humano ilimitado ni cobrar adicionales ocultos. No fijar renovación ni descuentos18/24 meses sin datos de operación.

## Componentes encontrados en el código

API NestJS, Prisma/PostgreSQL, imágenes privadas mediante Supabase, sockets para juegos, PDF y procesamiento sharp. Web institucional está pendiente. `render.yaml` es de staging/free: no acredita un servicio comercial activo ni la capacidad del piloto. Una sola base compartida con aislamiento institucional evita pagar automáticamente un proyecto por colegio; su aislamiento aún debe verificarse en LIC-1/LIC-3. No duplicar PostgreSQL en Render si el proyecto elegido Supabase ya aloja esa base.

## Referencias oficiales consultadas

- [Supabase pricing](https://supabase.com/pricing): Pro desde25USD/mes, primer proyecto Micro cubierto por créditos de cómputo; almacenamiento/transferencia con límites y sobreconsumo. No sumar otros10USD al primer Micro ya incluido. Los backups de base no sustituyen un respaldo de objetos verificado.
- [Render pricing](https://render.com/pricing): servicio0.5CPU/512MiB7USD/mes;1CPU/2GiB25USD/mes;2CPU/4GiB85USD/mes. [Especificaciones](https://render.com/docs/compute-plans). Son precios de cómputo, no factura total garantizada; revisar workspace, transferencia y otros cargos antes de contratar. No presumir descuento o elegibilidad comercial del workspace gratuito.

Se verifica precio, no capacidad. No se deduce que100.000 usuarios activos incluidos en una tarifa equivalgan a100.000 estudiantes simultáneos. Cotizar de nuevo al contratar y revisar términos/cargos aplicables.

## Tres escenarios para decidir

No se asignan cantidades de estudiantes a los escenarios hasta medirlos. El primero es una hipótesis de laboratorio;512MiB puede ser insuficiente por PDF/imágenes/sockets. El segundo da una alternativa con más RAM, sin garantizar capacidad. El tercero ilustra aumento de cómputo, no una recomendación de compra.

Conversión de planificación: **4.500COP/USD, supuesto de sensibilidad, no TRM consultada**. Provisión auxiliar10USD/mes: presupuesto por confirmar para dominio/correo/monitoreo/respaldo, no cotización de proveedores; podría no bastar. Reserva técnica propuesta20%, no impuesto ni ganancia. Todas las cifras excluyen impuestos, comisiones, mano de obra y sobreconsumos no presupuestados.

| Escenario | Render + Supabase + provisión auxiliar, USD/mes | COP/mes al supuesto | Fondo6 meses +20% reserva | Saldo de2.500.000 antes de trabajo/impuestos |
| --- | ---: | ---: | ---: | ---: |
| Pequeño por validar | 7+25+10=42 | 189.000 | 1.360.800 | 1.139.200 |
| Más RAM por validar | 25+25+10=60 | 270.000 | 1.944.000 | 556.000 |
| Cómputo mayor por validar | 85+25+10=120 | 540.000 | 3.888.000 | -1.388.000 |

Saldo **no es utilidad neta**. Falta asignar horas de capacitación/soporte/mantenimiento, creación/revisión y derechos de contenido, impuestos/comisiones con asesoría correspondiente y posible recuperación de desarrollo. Si el equipo aporta horas o dinero, registrarlo como inversión explícita, no como costo inexistente. Modelar también caída de ingresos, dólar más alto y falla de servicio.

Fórmulas: costo técnico mensualUSD × cambio presupuestado ×6 ×1,20; saldo = ingreso − fondo técnico; utilidad = saldo − trabajo − demás gastos/impuestos. No retirar todo el anticipo: separar fondo de los6 meses antes de repartir. Si el escenario necesario supera el ingreso, reducir costos/alcance de común acuerdo, financiar inversión explícita o ajustar precio antes de firmar; no bajar seguridad ni incumplir funciones vendidas.

## Prueba preliminar local

`tool/pilot_capacity_local.mjs <owner.json>` acepta solo fixture I2 propietario temporal, valida URL PostgreSQL loopback y etiquetas Docker locales. No acepta API remota ni lee `.env`. Usa30 estudiantes sintéticos existentes, login secuencial y etapas de5/15/30 clientes con tres rondas de temas, perfil y ranking. Máximo450 lecturas medidas,10s de timeout por solicitud y detención al terminar una etapa con errores. La versión corregida no crea cuentas, respuestas, XP ni intentos; login sí genera sesión/token como autenticación normal. No imprime credenciales ni cuerpos de respuesta.

Incidencias de preparación: la sesión anterior no respondía y se levantó otra propia. La primera etapa utilizó incorrectamente la ruta GET de preguntas como lectura pura: esa ruta crea un intento y devuelve un objeto, no una lista. El verificador reportó15 fallos de forma y detuvo la escalada; no se atribuyen a saturación. Esas solicitudes pudieron crear15 intentos sintéticos sin respuestas/XP en la base desechable. Se retiró la ruta del probe y se sustituyó por perfil antes de repetir. Evidencia inicial `.tmp/pilot-capacity-initial-fixture-check.log`; no se eliminaron datos del usuario ni se cambió la lógica de preguntas. Revisar el carácter mutante de esta ruta antes de futuros ensayos y clientes/reintentos.

Resultados del2/nov, versión corregida:30 logins secuenciales aprobados (p95 156ms);450 lecturas aprobadas, cero errores. Etapas:

| Clientes concurrentes | Consultas | p50 | p95 | Máximo | Duración etapa |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 5 | 45 | 42ms | 75ms | 100ms | 1172ms |
| 15 | 135 | 96ms | 184ms | 234ms | 1737ms |
| 30 | 270 | 154ms | 287ms | 367ms | 2304ms |

Evidencia local no versionada `.tmp/pilot-capacity-local.log`, salida0. Son etapas muy cortas: no incluyen red externa, rampas sostenidas, métricas de memoria/CPU ni ráfaga de login. Base sintética pequeña, Node/Prisma en el host Windows y PostgreSQL Docker; sin equivalencia de recursos contra Render. No atribuir a este resultado capacidad contratada para30 o75 estudiantes. Percentiles incluyen errores, no se eliminan muestras lentas. `node --test tool/pilot_capacity_local.test.mjs`:2/2; `node --check tool/pilot_capacity_local.mjs`:salida0. No se ejecutó suite global por estos scripts/documentos.

## Lo que debe medirse antes de vender capacidad

Objetivo comercial por validar: un salón simultáneo y después75 usuarios. Fases propuestas: login simultáneo, lectura con imágenes/caché fría, guardar y entregar diagnóstico con consistencia, panel docente mientras trabajan alumnos, PDF en concurrencia acotada y juegos/socket con reconexión. Escalonar y fijar límite de duración/solicitudes; detener si hay degradación. Usar cuentas propias en entorno aislado y nunca producción sin autorización.

Registrar errores/timeout, p50/p95/p99 por ruta, solicitudes/s, memoria máxima del proceso, CPU, conexiones/esperas SQL, bytes transferidos, volumen de imágenes y escrituras. Probar varios minutos con tiempos de lectura realistas y eventos de inicio/entrega simultáneos. Medir BD fuera del mismo PC y red real posteriormente en staging autorizado. La prueba corta de lecturas no cubre esos criterios ni demuestra30 alumnos en un salón real.

Criterio candidato para revisión: cero errores funcionales/pérdida de respuestas, latencia interactiva p95 inferior a1,5s en rutas ordinarias y margen de memoria suficiente. PDF y autenticación requieren umbrales propios medidos. No ocultar rate limits, desactivar validaciones o aumentar timeouts para hacer pasar una prueba. Licencias aún no conectadas: este ensayo no certifica LIC-1.

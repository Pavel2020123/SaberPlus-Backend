import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { loadRuntimeEnvironment } from './config/runtime-environment';

async function bootstrap() {
  const runtime = loadRuntimeEnvironment();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const esProduccion = runtime.isProduction;

  // CORS habilitado solo para los orígenes web declarados. Los clientes
  // Android/iOS no dependen de CORS, pero usan los mismos endpoints HTTPS.
  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }
  app.enableCors({
    origin: runtime.allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Device-Id',
      'X-SaberPlus-Client',
      'X-Request-Id',
      'Idempotency-Key',
    ],
  });

  // La API no ejecuta documentos HTML; una CSP cerrada reduce el impacto si
  // una respuesta o un archivo llega a abrirse directamente en el navegador.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
      // El frontend vive en otro puerto y consume los logos desde /uploads.
      // Sin esta politica, Helmet permite abrir el archivo directamente pero
      // el navegador bloquea su uso dentro de Next.js.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      frameguard: { action: 'deny' },
      permittedCrossDomainPolicies: { permittedPolicies: 'none' },
      hsts: esProduccion
        ? { maxAge: 15552000, includeSubDomains: true, preload: true }
        : false,
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // La interfaz autenticada consulta varios recursos en paralelo. El límite
  // global protege la API sin bloquear la navegación normal del usuario.
  const limiteGlobalConfigurado = Number.parseInt(
    process.env.RATE_LIMIT_MAX ?? (esProduccion ? '1000' : '5000'),
    10,
  );
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max:
      Number.isFinite(limiteGlobalConfigurado) && limiteGlobalConfigurado > 0
        ? limiteGlobalConfigurado
        : 1000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (request) => request.path.startsWith('/uploads/'),
    message: {
      statusCode: 429,
      error: 'Too Many Requests',
      message:
        'Has realizado demasiadas solicitudes. Espera un momento e inténtalo nuevamente.',
    },
  });
  app.use(globalLimiter);

  // Endpoints sensibles con límites más estrictos
  const authLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: esProduccion ? 10 : 100,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
      statusCode: 429,
      error: 'Too Many Requests',
      message:
        'Demasiados intentos de inicio de sesión. Espera unos minutos antes de volver a intentarlo.',
    },
  });
  app.use('/auth/login', authLoginLimiter);
  app.use(
    '/auth/registro',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: esProduccion ? 20 : 100,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        statusCode: 429,
        error: 'Too Many Requests',
        message:
          'Demasiados intentos de registro. Espera unos minutos antes de volver a intentarlo.',
      },
    }),
  );

  const crearLimitadorPublico = (maxProduccion: number, mensaje: string) =>
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: esProduccion ? maxProduccion : 100,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        statusCode: 429,
        error: 'Too Many Requests',
        message: mensaje,
      },
    });
  app.use(
    '/auth/reenviar-verificacion',
    crearLimitadorPublico(
      5,
      'Espera unos minutos antes de solicitar otro correo de verificación.',
    ),
  );
  app.use(
    '/auth/solicitar-recuperacion',
    crearLimitadorPublico(
      5,
      'Espera unos minutos antes de solicitar otro enlace de recuperación.',
    ),
  );
  app.use(
    '/ventas/contacto',
    crearLimitadorPublico(
      8,
      'Recibimos demasiadas solicitudes. Espera unos minutos e intenta de nuevo.',
    ),
  );

  // Hardening: establecer límites explícitos de body para evitar DoS por payloads grandes
  app.use(bodyParser.json({ limit: '1mb' }));
  app.use(bodyParser.urlencoded({ extended: false, limit: '1mb' }));

  // Servimos /uploads como archivos estáticos (así se ven los logos que
  // se suben desde "Editar institución"). Mientras no usemos Supabase
  // Storage, esta carpeta local hace las veces de almacenamiento de archivos.
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

  app.enableShutdownHooks();
  await app.listen(runtime.port, '0.0.0.0');

  console.log(
    `SaberPlus API escuchando en 0.0.0.0:${runtime.port} (${esProduccion ? 'production' : 'development'}).`,
  );
}
void bootstrap();

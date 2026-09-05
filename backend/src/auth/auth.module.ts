import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from '../mail/mail.module';
import { ReferidosModule } from '../referidos/referidos.module';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  // Fail fast: no iniciar la app sin una clave JWT segura
  throw new Error('Missing required environment variable: JWT_SECRET');
}

@Module({
  imports: [
    PrismaModule,
    MailModule,
    ReferidosModule,
    JwtModule.register({
      global: true, // disponible en TODO el app sin reimportarlo
      secret: jwtSecret,
      signOptions: { expiresIn: '8h', algorithm: 'HS256' },
      verifyOptions: { algorithms: ['HS256'] },
    }),
  ],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}

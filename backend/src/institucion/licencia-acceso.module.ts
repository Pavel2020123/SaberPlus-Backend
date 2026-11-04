import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LicenciaAccesoService } from './licencia-acceso.service';
import { SaldoPersonalInstitucionalService } from './saldo-personal-institucional.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [LicenciaAccesoService, SaldoPersonalInstitucionalService],
  exports: [LicenciaAccesoService, SaldoPersonalInstitucionalService],
})
export class LicenciaAccesoModule {}

import { CompetitiveModule } from '../competitive/competitive.module';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GuardianController } from './guardian.controller';
import { GuardianService } from './guardian.service';

@Module({
  imports: [PrismaModule, CompetitiveModule],
  controllers: [GuardianController],
  providers: [GuardianService],
})
export class GuardianModule {}

import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Module({
  providers: [PrismaService],
  exports: [PrismaService], // Esta línea permite que otros archivos usen la base de datos
})
export class PrismaModule {}

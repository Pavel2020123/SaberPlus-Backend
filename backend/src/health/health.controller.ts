import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  live() {
    return {
      status: 'OK',
      service: 'saberplus-api',
    };
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'OK',
        service: 'saberplus-api',
        database: 'UP',
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'ERROR',
        service: 'saberplus-api',
        database: 'DOWN',
      });
    }
  }
}

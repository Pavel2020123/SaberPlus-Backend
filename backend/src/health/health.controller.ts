import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { checkCompetitiveReadiness } from './competitive.readiness';
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

  private probe?: Promise<void>;
  private checkedUntil = 0;
  private available = false;

  @Get('ready')
  async ready() {
    try {
      // Single flight; success valid for 5 s, failure for 1 s. No admission flag
      // bypass: recovery workers require the schema even with flags disabled.
      if (Date.now() >= this.checkedUntil) {
        this.probe ??= checkCompetitiveReadiness(this.prisma)
          .then(() => {
            this.available = true;
            this.checkedUntil = Date.now() + 5000;
          })
          .catch(() => {
            this.available = false;
            this.checkedUntil = Date.now() + 1000;
          })
          .finally(() => {
            this.probe = undefined;
          });
        await this.probe;
      }
      if (!this.available) throw new Error('READINESS_UNAVAILABLE');
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

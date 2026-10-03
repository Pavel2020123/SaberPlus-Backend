import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TiraAflojaController } from './tira-afloja.controller';
import { TiraAflojaService } from './tira-afloja.service';
import { TiraAflojaGateway } from './tira-afloja.gateway';
import { TiraAflojaRealtimePublisher } from './tira-afloja-realtime.publisher';
import { TiraAflojaWsAuthService } from './tira-afloja-ws-auth.service';
import { TiraAflojaWsExceptionFilter } from './tira-afloja-ws-exception.filter';
import { TiraAflojaPresenceService } from './tira-afloja-presence.service';

@Module({
  imports: [PrismaModule],
  controllers: [TiraAflojaController],
  providers: [
    TiraAflojaService,
    TiraAflojaPresenceService,
    TiraAflojaGateway,
    TiraAflojaRealtimePublisher,
    TiraAflojaWsAuthService,
    TiraAflojaWsExceptionFilter,
  ],
  exports: [TiraAflojaService],
})
export class TiraAflojaModule {}

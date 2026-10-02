import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TriviaRushController } from './trivia-rush.controller';
import { TriviaRushService } from './trivia-rush.service';
import { TriviaPresenceService } from './trivia-presence.service';
import { TriviaPresenceGateway } from './trivia-presence.gateway';
import { TiraAflojaWsAuthService } from '../tira-afloja/tira-afloja-ws-auth.service';

@Module({
  imports: [PrismaModule],
  controllers: [TriviaRushController],
  providers: [
    TriviaRushService,
    TriviaPresenceService,
    TriviaPresenceGateway,
    TiraAflojaWsAuthService,
  ],
  exports: [TriviaRushService],
})
export class TriviaRushModule {}

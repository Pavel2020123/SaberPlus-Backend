import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { KnowledgeShieldController } from './knowledge-shield.controller';
import { KnowledgeShieldService } from './knowledge-shield.service';

@Module({
  imports: [PrismaModule],
  controllers: [KnowledgeShieldController],
  providers: [KnowledgeShieldService],
})
export class KnowledgeShieldModule {}

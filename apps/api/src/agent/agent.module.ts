import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { BatchRunner } from './batch.runner';

@Module({
  providers: [AgentService, BatchRunner],
  exports: [AgentService, BatchRunner],
})
export class AgentModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobsService } from './jobs.service';
import { JobsProcessor } from './jobs.processor';
import { JobsQueue } from '../entities/jobs-queue.entity';
import { JobsQueueHistory } from '../entities/jobs-queue-history.entity';
import { ApiEvent } from '../entities/api-event.entity';
import { SecretsService } from '../config/secrets.service';

@Module({
  imports: [TypeOrmModule.forFeature([JobsQueue, JobsQueueHistory, ApiEvent])],
  providers: [JobsService, JobsProcessor, SecretsService],
})
export class JobsModule {}

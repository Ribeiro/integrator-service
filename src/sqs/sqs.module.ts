import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SqsConsumerService } from './sqs-consumer.service';
import { ApiEvent } from '../entities/api-event.entity';
import { JobsQueue } from '../entities/jobs-queue.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ApiEvent, JobsQueue])],
  providers: [SqsConsumerService],
})
export class SqsModule {}

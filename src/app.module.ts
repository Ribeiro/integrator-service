import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './config/config.module';
import { SqsModule } from './sqs/sqs.module';
import { JobsModule } from './jobs/jobs.module';
import { ApiEvent } from './entities/api-event.entity';
import { JobsQueue } from './entities/jobs-queue.entity';
import { JobsQueueHistory } from './entities/jobs-queue-history.entity';

@Module({
  imports: [
    ConfigModule,
    SqsModule,
    JobsModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: +(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      entities: [ApiEvent, JobsQueue, JobsQueueHistory],
      synchronize: true,
    }),
  ],
})
export class AppModule {}

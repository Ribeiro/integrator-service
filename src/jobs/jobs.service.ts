/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { SecretsService } from 'src/config/secrets.service';
import { ApiEvent } from 'src/entities/api-event.entity';
import { JobsQueueHistory } from 'src/entities/jobs-queue-history.entity';
import { JobsQueue } from 'src/entities/jobs-queue.entity';
import { SqsProducerService } from 'src/sqs/sqs-producer.service';
import { DataSource, Repository } from 'typeorm';
import axios from 'axios';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class JobsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly secretsService: SecretsService,
    private readonly sqsService: SqsProducerService,
    @InjectRepository(ApiEvent)
    private readonly eventRepo: Repository<ApiEvent>,
    @InjectRepository(JobsQueue)
    private readonly jobRepo: Repository<JobsQueue>,
    @InjectRepository(JobsQueueHistory)
    private readonly historyRepo: Repository<JobsQueueHistory>,
  ) {}

  async processJobs(): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const result = await queryRunner.query(`
        SELECT jq.*
        FROM jobs_queue jq
        WHERE jq.status = 'pending'
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `);

      if (!result || result.length === 0) {
        await queryRunner.rollbackTransaction();
        return;
      }

      const job: JobsQueue = plainToInstance(JobsQueue, result[0]);

      job.event = await this.eventRepo.findOneByOrFail({ id: job.event.id });

      const config = await this.secretsService.getJobConfig();
      const { maxAttempts, timeoutMs, backoffMs } = config;

      let attempt = 0;
      let success = false;
      let response: any;
      let statusCode = 0;

      while (attempt < maxAttempts && !success) {
        attempt++;
        try {
          const res = await axios.request({
            method: job.event.httpMethod,
            url: job.event.destinationApiUrl,
            data: job.event.payload,
            timeout: timeoutMs,
          });

          statusCode = res.status;
          response = res.data;

          await this.historyRepo.save({
            job,
            httpStatus: statusCode,
            responsePayload: response,
          });

          if (statusCode >= 200 && statusCode < 300) {
            success = true;
            await this.sqsService.sendMessage(job.event.responseQueueUrl, {
              request_id: job.event.requestId,
              statusCode,
              data: response,
              result: 'success',
            });
          }
        } catch (err) {
          statusCode = err.response?.status || 500;
          response = err.response?.data || { error: 'Request failed' };

          await this.historyRepo.save({
            job,
            httpStatus: statusCode,
            responsePayload: response,
          });

          await new Promise((r) => setTimeout(r, backoffMs));
        }
      }

      if (!success) {
        await this.sqsService.sendMessage(job.event.responseQueueUrl, {
          request_id: job.event.requestId,
          statusCode,
          data: response,
          result: 'failure',
        });
      }

      await this.jobRepo.update(job.id, {
        status: success ? 'completed' : 'failed',
      });

      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      console.error('Error processing job:', e);
    } finally {
      await queryRunner.release();
    }
  }
}

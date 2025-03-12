/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { SecretsService } from 'src/config/secrets.service';
import { ApiEvent } from 'src/entities/api-event.entity';
import { JobsQueueHistory } from 'src/entities/jobs-queue-history.entity';
import { JobsQueue } from 'src/entities/jobs-queue.entity';
import { SqsProducerService } from 'src/sqs/sqs-producer.service';
import { DataSource, Repository } from 'typeorm';
import axios from 'axios';
import { plainToInstance } from 'class-transformer';
import { JobLogger } from 'src/utils/job-logger';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

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
      const config = await this.secretsService.getJobConfig();
      const { concurrentJobs } = config;

      const result = await queryRunner.query(`
        SELECT jq.*
        FROM jobs_queue jq
        WHERE jq.status = 'pending'
        FOR UPDATE SKIP LOCKED
        LIMIT ${concurrentJobs}
      `);

      if (!result || result.length === 0) {
        this.logger.log('No pending jobs found.');
        await queryRunner.rollbackTransaction();
        return;
      }

      const jobs: JobsQueue[] = result.map((row) =>
        plainToInstance(JobsQueue, row),
      );

      this.logger.log(`Found ${jobs.length} job(s) to process.`);

      await queryRunner.commitTransaction();
      await queryRunner.release();

      await Promise.allSettled(
        jobs.map((job) => this.processSingleJob(job, config)),
      );
    } catch (e) {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
      this.logger.error('Error processing jobs batch', e.stack ?? e);
    }
  }

  private async processSingleJob(job: JobsQueue, config: any): Promise<void> {
    const logger = new JobLogger(`job-${job.id}`);
    let attempt = 0;
    let success = false;
    let response: any;
    let statusCode = 0;

    logger.log('Starting Job execution');

    try {
      const event = await this.eventRepo.findOneByOrFail({ id: job.event.id });

      while (attempt < config.maxAttempts && !success) {
        attempt++;
        logger.debug('Running attempt', { attempt });

        try {
          const res = await axios.request({
            method: event.httpMethod,
            url: event.destinationApiUrl,
            data: event.payload,
            timeout: config.timeoutMs,
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
            logger.log('Http Request successfully completed', { statusCode });

            await this.sqsService.sendMessage(event.responseQueueUrl, {
              request_id: event.requestId,
              statusCode,
              data: response,
              result: 'success',
            });
          }
        } catch (err) {
          statusCode = err.response?.status || 500;
          response = err.response?.data || { error: 'Http Request failed' };

          logger.warn('Http Request Error', {
            attempt,
            statusCode,
            response,
          });

          await this.historyRepo.save({
            job,
            httpStatus: statusCode,
            responsePayload: response,
          });

          await new Promise((r) => setTimeout(r, config.backoffMs));
        }
      }

      if (!success) {
        logger.warn('All attempts to run Job failed');

        await this.sqsService.sendMessage(event.responseQueueUrl, {
          request_id: event.requestId,
          statusCode,
          data: response,
          result: 'failure',
        });
      }

      await this.jobRepo.update(job.id, {
        status: success ? 'completed' : 'failed',
      });
    } catch (e) {
      logger.error('Erro during Job execution', e);
      await this.jobRepo.update(job.id, { status: 'failed' });
    }
  }
}

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiEvent } from '../entities/api-event.entity';
import { JobsQueue } from '../entities/jobs-queue.entity';
import { IncomingEventDto } from '../dto/incoming-event.dto';

@Injectable()
export class SqsConsumerService implements OnModuleInit {
  private readonly logger = new Logger(SqsConsumerService.name);
  private readonly sqsClient = new SQSClient({
    region: process.env.AWS_REGION,
  });
  private readonly queueUrl = process.env.INCOMING_QUEUE_URL;

  constructor(
    @InjectRepository(ApiEvent)
    private readonly apiEventRepo: Repository<ApiEvent>,
    @InjectRepository(JobsQueue)
    private readonly jobsQueueRepo: Repository<JobsQueue>,
  ) {}

  async onModuleInit() {
    await this.pollQueue();
  }

  private async pollQueue() {
    while (true) {
      try {
        const response = await this.sqsClient.send(
          new ReceiveMessageCommand({
            QueueUrl: this.queueUrl,
            MaxNumberOfMessages: 5,
            WaitTimeSeconds: 10,
          }),
        );

        if (response.Messages) {
          for (const message of response.Messages) {
            await this.handleMessage(message.Body!);
            await this.sqsClient.send(
              new DeleteMessageCommand({
                QueueUrl: this.queueUrl,
                ReceiptHandle: message.ReceiptHandle!,
              }),
            );
          }
        }
      } catch (error) {
        this.logger.error(
          '[pollQueue] Error processing message from SQS queue',
          error,
        );
      }
    }
  }

  private async handleMessage(body: string) {
    try {
      const incomingEvent: IncomingEventDto = JSON.parse(body);

      const apiEvent = this.apiEventRepo.create({
        requestId: incomingEvent.request_id,
        payload: incomingEvent.payload,
        originService: incomingEvent.originService,
        destinationApi: incomingEvent.destinationApi,
        destinationApiUrl: incomingEvent.destinationApiUrl,
        httpMethod: incomingEvent.httpMethod,
        responseQueueUrl: incomingEvent.responseQueueUrl,
        createdAt: new Date(),
      });

      const savedEvent = await this.apiEventRepo.save(apiEvent);

      const job = this.jobsQueueRepo.create({
        event: savedEvent,
        status: 'pending',
        createdAt: new Date(),
      });

      await this.jobsQueueRepo.save(job);
      this.logger.log(
        `[handleMessage] Incoming API Event saved and created job for request_id: ${incomingEvent.request_id}`,
      );
    } catch (err) {
      this.logger.error(
        '[handleMessage] Error while processing message from SQS queue',
        err,
      );
    }
  }
}

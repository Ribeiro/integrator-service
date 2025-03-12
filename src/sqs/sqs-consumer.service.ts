/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  Message,
} from '@aws-sdk/client-sqs';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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

    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    this.logger.log('[onModuleInit] Starting queue polling...');
    await this.pollQueue();
  }

  private async pollQueue() {
    this.logger.log(`[pollQueue] Polling started for queue: ${this.queueUrl}`);
    while (true) {
      try {
        const response = await this.sqsClient.send(
          new ReceiveMessageCommand({
            QueueUrl: this.queueUrl,
            MaxNumberOfMessages: 5,
            WaitTimeSeconds: 10,
          }),
        );

        if (response.Messages && response.Messages.length > 0) {
          this.logger.debug(
            `[pollQueue] Received ${response.Messages.length} message(s)`,
          );
          for (const message of response.Messages) {
            this.logger.debug(
              `[pollQueue] Processing message ID: ${message.MessageId}`,
            );

            const processed = await this.handleMessage(message);

            if (processed) {
              this.logger.debug(
                `[pollQueue] Deleting message ID: ${message.MessageId}`,
              );
              await this.sqsClient.send(
                new DeleteMessageCommand({
                  QueueUrl: this.queueUrl,
                  ReceiptHandle: message.ReceiptHandle!,
                }),
              );
              this.logger.debug(
                `[pollQueue] Message ID ${message.MessageId} deleted`,
              );
            } else {
              this.logger.warn(
                `[pollQueue] Skipping deletion for failed message ID: ${message.MessageId}`,
              );
            }
          }
        } else {
          this.logger.debug(
            '[pollQueue] No messages received in this polling cycle',
          );
        }
      } catch (error) {
        this.logger.error(
          '[pollQueue] Error processing message from SQS queue',
          error,
        );
      }
    }
  }

  private async handleMessage(message: Message): Promise<boolean> {
    try {
      const body = message.Body!;
      this.logger.debug(`[handleMessage] Raw message body: ${body}`);

      const incomingEvent: IncomingEventDto = JSON.parse(body);

      this.logger.debug(
        `[handleMessage] Parsed IncomingEventDto: ${JSON.stringify(incomingEvent)}`,
      );

      return await this.dataSource.transaction(async (manager) => {
        this.logger.debug('[handleMessage] Starting database transaction');

        const apiEvent = manager.create(ApiEvent, {
          requestId: incomingEvent.request_id,
          payload: incomingEvent.payload,
          originService: incomingEvent.originService,
          destinationApi: incomingEvent.destinationApi,
          destinationApiUrl: incomingEvent.destinationApiUrl,
          httpMethod: incomingEvent.httpMethod,
          responseQueueUrl: incomingEvent.responseQueueUrl,
          createdAt: new Date(),
        });

        const savedEvent = await manager.save(ApiEvent, apiEvent);
        this.logger.debug(
          `[handleMessage] Saved ApiEvent with ID: ${savedEvent.id}`,
        );

        const job = manager.create(JobsQueue, {
          event: savedEvent,
          status: 'pending',
          createdAt: new Date(),
        });

        const savedJob = await manager.save(JobsQueue, job);
        this.logger.debug(
          `[handleMessage] Saved JobsQueue entry with ID: ${savedJob.id}`,
        );

        this.logger.log(
          `[handleMessage] Event processed and job created successfully for request_id: ${incomingEvent.request_id}`,
        );

        return true;
      });
    } catch (err) {
      this.logger.error('[handleMessage] Error while processing message', err);
      return false;
    }
  }
}

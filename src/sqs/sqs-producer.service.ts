import { Injectable } from '@nestjs/common';
import { SQS } from 'aws-sdk';

@Injectable()
export class SqsProducerService {
  private readonly sqs = new SQS({ region: 'us-east-1' });

  async sendMessage(queueUrl: string, messageBody: any) {
    await this.sqs
      .sendMessage({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(messageBody),
      })
      .promise();
  }
}

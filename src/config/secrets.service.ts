import { Injectable } from '@nestjs/common';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

@Injectable()
export class SecretsService {
  private readonly client = new SecretsManagerClient({ region: 'us-east-1' });

  async getJobConfig(): Promise<{
    maxAttempts: number;
    timeoutMs: number;
    backoffMs: number;
  }> {
    const command = new GetSecretValueCommand({ SecretId: 'job-config' });
    const response = await this.client.send(command);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return JSON.parse(response.SecretString || '{}');
  }
}

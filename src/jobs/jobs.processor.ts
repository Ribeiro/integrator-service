import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JobsService } from './jobs.service';

@Injectable()
export class JobsProcessor {
  constructor(private readonly jobsService: JobsService) {}

  @Cron('*/30 * * * * *')
  async handleCron() {
    await this.jobsService.processJobs();
  }
}

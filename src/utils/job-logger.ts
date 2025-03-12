import { Logger } from '@nestjs/common';

export class JobLogger {
  private readonly logger: Logger;

  constructor(private readonly context: string) {
    this.logger = new Logger(context);
  }

  log(message: string, data?: Record<string, any>) {
    this.logger.log(this.format(message, data));
  }

  debug(message: string, data?: Record<string, any>) {
    this.logger.debug(this.format(message, data));
  }

  warn(message: string, data?: Record<string, any>) {
    this.logger.warn(this.format(message, data));
  }

  error(message: string, error?: unknown, data?: Record<string, any>) {
    const errorMsg =
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : error;

    this.logger.error(this.format(message, { ...data, error: errorMsg }));
  }

  private format(message: string, data?: Record<string, any>): string {
    return JSON.stringify({ traceId: this.context, message, ...(data || {}) });
  }
}

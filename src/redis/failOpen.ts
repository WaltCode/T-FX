import type { Logger } from '@nestjs/common';

export const describeError = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export class FailOpen {
  private lastWarnAt = 0;

  constructor(
    private readonly logger: Logger,
    private readonly consequence: string,
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn();
    } catch (err) {
      const now = Date.now();
      if (now - this.lastWarnAt > 10_000) {
        this.lastWarnAt = now;
        this.logger.warn(`Redis unavailable (${describeError(err)}); ${this.consequence}`);
      }
      return undefined;
    }
  }
}

import { setTimeout as delay } from 'node:timers/promises';
import { QueryFailedError } from 'typeorm';

export const PgError = {
  UNIQUE_VIOLATION: '23505',
  NUMERIC_OUT_OF_RANGE: '22003',
  SERIALIZATION_FAILURE: '40001',
  DEADLOCK_DETECTED: '40P01',
} as const;

export function pgErrorCode(err: unknown): string | undefined {
  if (!(err instanceof QueryFailedError)) return undefined;
  const { code } = err.driverError as { code?: unknown };
  return typeof code === 'string' ? code : undefined;
}

const RETRYABLE = new Set<string>([PgError.SERIALIZATION_FAILURE, PgError.DEADLOCK_DETECTED]);

export async function withSerializationRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const code = pgErrorCode(err);
      if (!code || !RETRYABLE.has(code) || attempt >= attempts) throw err;
      await delay(10 * attempt + Math.random() * 20);
    }
  }
}

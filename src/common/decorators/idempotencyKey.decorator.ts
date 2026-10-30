import { createHash } from 'node:crypto';
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { errors } from '../errors/domain.error.js';

export interface IdempotencyInput {
  key: string;
  requestHash: string;
}

const KEY_PATTERN = /^[A-Za-z0-9_\-:.]{8,255}$/;

/** Reads the Idempotency-Key header and fingerprints the request, so reusing a key with a different body is caught. */
export const IdempotencyKey = createParamDecorator((_: unknown, ctx: ExecutionContext): IdempotencyInput => {
  const req = ctx.switchToHttp().getRequest<Request>();
  const key = req.header('idempotency-key');
  if (!key) throw errors.idempotencyKeyMissing();
  if (!KEY_PATTERN.test(key)) throw errors.idempotencyKeyInvalid();
  const fingerprint = `${req.method} ${req.path}\n${canonicalJson(req.body)}`;
  return { key, requestHash: createHash('sha256').update(fingerprint).digest('hex') };
});

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

import type { ValueTransformer } from 'typeorm';

export const bigintTransformer: ValueTransformer = {
  to: (value: bigint | null | undefined) => (value === null || value === undefined ? value : value.toString()),
  from: (value: string | null) => (value === null ? null : BigInt(value)),
};

import { Decimal } from 'decimal.js';
import { errors } from '../errors/domain.error.js';

/** Every stablecoin is stored as an integer count of micro-units (6 decimal places). */
export const SCALE = 6;
export const UNIT = 10n ** BigInt(SCALE);
/** Largest amount accepted in a single operation: 1 trillion units. */
export const MAX_AMOUNT = 1_000_000_000_000n * UNIT;
export const AMOUNT_PATTERN = /^(0|[1-9]\d{0,12})(\.\d{1,6})?$/;

/** Enough precision that only our explicit rounding ever matters. */
export const Dec = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_DOWN });

export function parseAmount(input: string): bigint {
  if (!AMOUNT_PATTERN.test(input)) {
    throw errors.invalidAmount('Amount must be a positive decimal string with at most 6 decimal places');
  }
  const [whole, fraction = ''] = input.split('.');
  const minor = BigInt(whole) * UNIT + BigInt(fraction.padEnd(SCALE, '0'));
  if (minor <= 0n) throw errors.invalidAmount('Amount must be greater than zero');
  if (minor > MAX_AMOUNT) throw errors.invalidAmount('Amount exceeds the per-operation maximum of 1000000000000');
  return minor;
}

export function formatAmount(minor: bigint): string {
  const sign = minor < 0n ? '-' : '';
  const abs = minor < 0n ? -minor : minor;
  return `${sign}${(abs / UNIT).toString()}.${(abs % UNIT).toString().padStart(SCALE, '0')}`;
}

/** Converts at the exact ratio of two USD rates, rounding down to whole micro-units. */
export function convertAmount(minor: bigint, fromPerUsd: Decimal.Value, toPerUsd: Decimal.Value): bigint {
  const converted = new Dec(minor.toString()).mul(toPerUsd).div(fromPerUsd);
  return BigInt(converted.toDecimalPlaces(0, Decimal.ROUND_DOWN).toFixed(0));
}

/** Units of `to` per one unit of `from`, truncated to 18 dp for storage and display. */
export function crossRate(fromPerUsd: Decimal.Value, toPerUsd: Decimal.Value): string {
  return new Dec(toPerUsd).div(fromPerUsd).toDecimalPlaces(18, Decimal.ROUND_DOWN).toFixed();
}

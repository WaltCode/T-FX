import { CURRENCIES, type Currency } from "./money/currency.js";

export const RATE_SOURCES = ['LIVE', 'CACHED', 'FALLBACK'] as const;
/** LIVE: fresh from the provider. CACHED: last good live rates while the provider fails. FALLBACK: static table. */
export type RateSource = (typeof RATE_SOURCES)[number];

/** Units of each stablecoin per 1 USD, as decimal strings. */
export type UsdRates = Record<Currency, string>;

export interface FxSnapshot {
  perUsd: UsdRates;
  fetchedAt: string;
}

export interface FxProvider {
  readonly name: string;
  fetchUsdRates(): Promise<UsdRates>;
}

export const FX_PROVIDER = Symbol('FX_PROVIDER');

export interface FxQuote {
  from: Currency;
  to: Currency;
  rate: string;
  source: RateSource;
  asOf: Date;
  convert(minor: bigint): bigint;
}

export const STATIC_SNAPSHOT: FxSnapshot = {
  perUsd: { USDx: '1', EURx: '0.92', cNGN: '1550', cGHS: '15.5', cXAF: '605' },
  fetchedAt: '2026-10-01T00:00:00.000Z',
};

export function toUsdRates(raw: Record<string, unknown>, keyFor: (currency: Currency) => string): UsdRates {
  const rates = {} as UsdRates;
  for (const currency of CURRENCIES) {
    const value = raw[keyFor(currency)];
    const text = typeof value === 'number' ? String(value) : value;
    if (typeof text !== 'string' || !/^\d+(\.\d+)?$/.test(text) || Number(text) <= 0) {
      throw new Error(`Missing or invalid rate for ${keyFor(currency)}`);
    }
    rates[currency] = text;
  }
  return rates;
}

export function parseSnapshot(raw: string): FxSnapshot {
  const data = JSON.parse(raw) as { perUsd?: Record<string, unknown>; fetchedAt?: unknown };
  if (!data.perUsd || typeof data.fetchedAt !== 'string' || Number.isNaN(Date.parse(data.fetchedAt))) {
    throw new Error('Malformed FX snapshot');
  }
  return { perUsd: toUsdRates(data.perUsd, (currency) => currency), fetchedAt: data.fetchedAt };
}
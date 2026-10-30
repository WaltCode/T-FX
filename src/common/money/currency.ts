export const CURRENCIES = ['cNGN', 'cGHS', 'cXAF', 'USDx', 'EURx'] as const

export type Currency = (typeof CURRENCIES)[number]

export const USD: Currency = 'USDx'

export const FIAT_MAP: Record<Currency, string>  = {
    cNGN: 'NGN',
    cGHS: 'GHS',
    cXAF: 'XAF',
    USDx: 'USD',
    EURx: 'EUR'
}

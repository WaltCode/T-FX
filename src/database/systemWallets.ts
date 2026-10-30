
export const SYSTEM_WALLETS = {
  MINT: '00000000-0000-4000-8000-000000000001',
  FX_POOL: '00000000-0000-4000-8000-000000000002',
} as const;

export const SYSTEM_WALLET_IDS: ReadonlySet<string> = new Set(Object.values(SYSTEM_WALLETS));

export const cacheKeys = {
  walletVersion: (walletId: string) => `wallet:${walletId}:ver`,
  wallet: (walletId: string, version: string) => `wallet:${walletId}:v${version}:view`,
  walletHistory: (walletId: string, version: string, queryHash: string) =>
    `wallet:${walletId}:v${version}:txns:${queryHash}`,
  transaction: (id: string) => `txn:${id}`,
  rateLimit: (policy: string, subject: string) => `rl:${policy}:${subject}`,
  fxSnapshot: 'fx:snapshot',
  fxUpdatedChannel: 'fx:updated',
  fxRefreshLock: 'fx:refresh:lock',
};

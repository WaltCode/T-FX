import * as dotenv from 'dotenv'
dotenv.config()

function num(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid numeric config value: ${value}`);
  return parsed;
}

export const AppConfig ={
    port: num(process.env.PORT, 8907),
    environment: process.env.APP_ENV,
    db:{
        url : process.env.DATABASE_URL,
        migrationsRun: (process.env.DB_MIGRATIONS_RUN ?? 'true') === 'true',
    },
    redis:{
        url: process.env.REDIS_URL ?? 'redis://localhost:6379'
    },
    fx: {
        providerUrl: process.env.FX_PROVIDER_URL || 'https://open.er-api.com/v6/latest/USD',
        provider: process.env.FX_PROVIDER === 'static' ? 'static' : 'open-er-api',
        refreshMs: num(process.env.FX_REFRESH_MS, 300000),
        timeoutMs: num(process.env.FX_TIMEOUT_MS, 3000),
        maxStalenessMs: num(process.env.FX_MAX_STALENESS_MS, 86400000)
    },
    rateLimit:{
        windowMs: num(process.env.RATE_LIMIT_WINDOW_MS, 60000),
        global: num(process.env.RATE_LIMIT_GLOBAL_PER_MIN, 120),
        walletCreation: num(process.env.RATE_LIMIT_WALLET_CREATE_PER_MIN, 5),
        money: num(process.env.RATE_LIMIT_MONEY_PER_MIN, 30),
    },
    cache:{
        walletTTL: num(process.env.CACHE_WALLET_TTL_SEC, 60),
        transactionTTLSec: 3600
    }
}

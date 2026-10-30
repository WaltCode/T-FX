import { inject } from 'vitest';

process.env.DATABASE_URL = inject('databaseUrl');
process.env.REDIS_URL = inject('redisUrl');
process.env.DB_MIGRATIONS_RUN = 'false';
process.env.FX_REFRESH_MS = '600000';
process.env.FX_MAX_STALENESS_MS = '86400000';
process.env.RATE_LIMIT_GLOBAL_PER_MIN = '100000';
process.env.RATE_LIMIT_WALLET_CREATE_PER_MIN = '100000';
process.env.RATE_LIMIT_MONEY_PER_MIN = '100000';

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/database.module.js';
import { RateLimitGuard } from './guard/rateLimit.guard.js';
import { FxModule } from './modules/fx/fx.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { TransactionModule } from './modules/transaction/transaction.module.js';
import { WalletModule } from './modules/wallet/wallet.module.js';
import { RedisModule } from './redis/redis.module.js';

@Module({
  imports: [DatabaseModule, RedisModule, FxModule, WalletModule, TransactionModule, HealthModule],
  controllers: [],
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class AppModule {}

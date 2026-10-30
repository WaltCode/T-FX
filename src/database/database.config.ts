import { AppConfig } from '../config/index.js';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { FxRate } from '../modules/fx/entities/rate.entity.js';
import { IdempotencyRecord } from '../modules/transaction/entities/idempotencyRecord.entity.js';
import { LedgerEntry } from '../modules/transaction/entities/ledgerEntry.entity.js';
import { TransactionEntity } from '../modules/transaction/entities/transaction.entity.js';
import { Balance } from '../modules/wallet/entities/balance.entity.js';
import { Wallet } from '../modules/wallet/entities/wallet.entity.js';

// Listed explicitly: an entity glob needs __dirname, which ESM doesn't have.
export const ENTITIES = [Wallet, Balance, FxRate, TransactionEntity, LedgerEntry, IdempotencyRecord];

export const databaseConfig: TypeOrmModuleOptions = {
    type: 'postgres',
    url: AppConfig.db.url,
    entities: ENTITIES,
    migrations: ['dist/database/migrations/*.js'],
    migrationsRun: AppConfig.db.migrationsRun,
    synchronize: false,
    extra: { max: 20 },
}

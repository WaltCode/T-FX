import { Module } from '@nestjs/common';
import { FxModule } from '../fx/fx.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { LedgerService } from './ledger.service.js';
import { IdempotencyRecordRepository } from './repository/idempotencyRecord.repository.js';
import { LedgerEntryRepository } from './repository/ledgerEntry.repository.js';
import { TransactionRepository } from './repository/transaction.repository.js';
import { TransactionController } from './transaction.controller.js';
import { TransactionService } from './transaction.service.js';

@Module({
  imports: [WalletModule, FxModule],
  controllers: [TransactionController],
  providers: [
    TransactionService,
    LedgerService,
    TransactionRepository,
    LedgerEntryRepository,
    IdempotencyRecordRepository,
  ],
})
export class TransactionModule {}

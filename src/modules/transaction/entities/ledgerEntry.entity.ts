import { Check, Column, Entity, Index } from 'typeorm';
import type { Currency } from '../../../common/money/currency.js';
import { BaseEntity } from '../../../config/repository/base-entity.js';
import { bigintTransformer } from '../../../database/transaformers.js';

@Entity({ name: 'ledger_entries' })
@Index('ledger_entries_transaction_idx', ['transactionId'])
@Index('ledger_entries_wallet_idx', ['walletId', 'currency'])
@Check('ledger_entries_non_zero', `"amount" <> 0`)
export class LedgerEntry extends BaseEntity {
  @Column({ name: 'transaction_id', type: 'varchar', length: 40 })
  transactionId: string;

  @Column({ name: 'wallet_id', type: 'varchar', length: 40 })
  walletId: string;

  @Column({ type: 'varchar', length: 8 })
  currency: Currency;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  amount: bigint;

  @Column({ name: 'balance_after', type: 'bigint', nullable: true, transformer: bigintTransformer })
  balanceAfter: bigint | null;
}

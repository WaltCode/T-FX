import { Check, Column, Entity, Index, Unique } from 'typeorm';
import type { Currency } from '../../../common/money/currency.js';
import type { RateSource } from '../../../common/types.js';
import { BaseEntity } from '../../../config/repository/base-entity.js';
import { bigintTransformer } from '../../../database/transaformers.js';

export const TRANSACTION_TYPES = ['DEPOSIT', 'SWAP', 'TRANSFER'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export type TransactionStatus = 'COMPLETED';


@Entity({ name: 'transactions' })
@Unique('transactions_idempotency_uq', ['walletId', 'idempotencyKey'])
@Index('transactions_wallet_history_idx', ['walletId', 'internalId'])
@Index('transactions_counterparty_history_idx', ['receiverWalletId', 'internalId'])
@Check('transactions_positive_amounts', `"source_amount" > 0 AND "dest_amount" > 0`)
export class TransactionEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 16 })
  type: TransactionType;

  @Column({ type: 'varchar', length: 16 })
  status: TransactionStatus;

  @Column({ name: 'wallet_id', type: 'varchar', length: 40 })
  walletId: string;

 
  @Column({ name: 'receiver_wallet_id', type: 'varchar', length: 40, nullable: true })
  receiverWalletId: string | null;

  @Column({ name: 'source_currency', type: 'varchar', length: 8 })
  sourceCurrency: Currency;

  @Column({ name: 'source_amount', type: 'bigint', transformer: bigintTransformer })
  sourceAmount: bigint;

  @Column({ name: 'dest_currency', type: 'varchar', length: 8 })
  destCurrency: Currency;

  @Column({ name: 'dest_amount', type: 'bigint', transformer: bigintTransformer })
  destAmount: bigint;

  @Column({ type: 'numeric', precision: 36, scale: 18, nullable: true })
  rate: string | null;

  @Column({ name: 'rate_source', type: 'varchar', length: 16, nullable: true })
  rateSource: RateSource | null;

  @Column({ name: 'rate_as_of', type: 'timestamptz', nullable: true })
  rateAsOf: Date | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 255 })
  idempotencyKey: string;
}

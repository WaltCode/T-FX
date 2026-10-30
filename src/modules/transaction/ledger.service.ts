import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { errors } from '../../common/errors/domain.error.js';
import type { Currency } from '../../common/money/currency.js';
import { formatAmount } from '../../common/money/money.js';
import type { RateSource } from '../../common/types.js';
import { withSerializationRetry } from '../../database/pg-errors.js';
import { SYSTEM_WALLET_IDS } from '../../database/systemWallets.js';
import { BalanceRepository } from '../wallet/repository/balance.repository.js';
import type { LedgerEntry } from './entities/ledgerEntry.entity.js';
import type { TransactionEntity, TransactionType } from './entities/transaction.entity.js';
import { IdempotencyRecordRepository } from './repository/idempotencyRecord.repository.js';
import { LedgerEntryRepository } from './repository/ledgerEntry.repository.js';
import { TransactionRepository } from './repository/transaction.repository.js';

export interface Leg {
  walletId: string;
  currency: Currency;
  amount: bigint;
}

export interface Posting {
  type: TransactionType;
  walletId: string;
  receiverWalletId?: string;
  sourceCurrency: Currency;
  sourceAmount: bigint;
  destCurrency: Currency;
  destAmount: bigint;
  rate?: string;
  rateSource?: RateSource;
  rateAsOf?: Date;
  idempotencyKey: string;
}

export interface PostedTransaction {
  transaction: TransactionEntity;
  entries: LedgerEntry[];
}

export interface IdempotencyContext {
  scope: string;
  key: string;
  requestHash: string;
}

export interface IdempotentResult<T> {
  body: T;
  replayed: boolean;
}

@Injectable()
export class LedgerService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly balanceRepository: BalanceRepository,
    private readonly transactionRepository: TransactionRepository,
    private readonly ledgerEntryRepository: LedgerEntryRepository,
    private readonly idempotencyRecordRepository: IdempotencyRecordRepository,
  ) {}

  async runIdempotent<T extends object>(
    ctx: IdempotencyContext,
    work: (manager: EntityManager) => Promise<{ body: T; transactionId: string }>,
  ): Promise<IdempotentResult<T>> {
    return withSerializationRetry(() =>
      this.dataSource.transaction(async (manager) => {
        const records = this.idempotencyRecordRepository.withManager(manager);
        if (!(await records.claim(ctx.scope, ctx.key, ctx.requestHash))) {
          const record = await records.findOneByOrFail({ scope: ctx.scope, key: ctx.key });
          if (record.requestHash !== ctx.requestHash) throw errors.idempotencyKeyReused();
          return { body: record.responseBody as T, replayed: true };
        }
        const { body, transactionId } = await work(manager);
        await records.complete(ctx.scope, ctx.key, body, transactionId);
        return { body, replayed: false };
      }),
    );
  }

  async post(manager: EntityManager, posting: Posting, legs: Leg[]): Promise<PostedTransaction> {
    assertBalanced(legs);
    const balances = this.balanceRepository.withManager(manager);
    const balanceAfter = new Map<Leg, bigint | null>();
    for (const leg of [...legs].sort(byLockOrder)) {
      if (SYSTEM_WALLET_IDS.has(leg.walletId)) {
        balanceAfter.set(leg, null);
        continue;
      }
      const after = await balances.applyDelta(leg.walletId, leg.currency, leg.amount);
      if (after === null) {
        const current = await balances.findOneByOrFail({ walletId: leg.walletId, currency: leg.currency });
        throw errors.insufficientFunds(leg.currency, formatAmount(current.amount), formatAmount(-leg.amount));
      }
      balanceAfter.set(leg, after);
    }

    const transactions = this.transactionRepository.withManager(manager);
    const transaction = await transactions.save(
      transactions.create({
        id: randomUUID(),
        type: posting.type,
        status: 'COMPLETED',
        walletId: posting.walletId,
        receiverWalletId: posting.receiverWalletId ?? null,
        sourceCurrency: posting.sourceCurrency,
        sourceAmount: posting.sourceAmount,
        destCurrency: posting.destCurrency,
        destAmount: posting.destAmount,
        rate: posting.rate ?? null,
        rateSource: posting.rateSource ?? null,
        rateAsOf: posting.rateAsOf ?? null,
        idempotencyKey: posting.idempotencyKey,
      }),
    );

    const ledgerEntries = this.ledgerEntryRepository.withManager(manager);
    const entries = await ledgerEntries.save(
      legs.map((leg) =>
        ledgerEntries.create({
          id: randomUUID(),
          transactionId: transaction.id,
          walletId: leg.walletId,
          currency: leg.currency,
          amount: leg.amount,
          balanceAfter: balanceAfter.get(leg) ?? null,
        }),
      ),
    );
    return { transaction, entries };
  }
}

function byLockOrder(a: Leg, b: Leg): number {
  const left = `${a.walletId}:${a.currency}`;
  const right = `${b.walletId}:${b.currency}`;
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertBalanced(legs: Leg[]): void {
  const totals = new Map<Currency, bigint>();
  for (const leg of legs) totals.set(leg.currency, (totals.get(leg.currency) ?? 0n) + leg.amount);
  for (const [currency, total] of totals) {
    if (total !== 0n) throw new Error(`Unbalanced posting in ${currency}`);
  }
}

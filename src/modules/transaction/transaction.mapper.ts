import { Dec, formatAmount } from '../../common/money/money.js';
import type { Direction, LedgerEntryDto, TransactionDto } from './dto/transaction.dto.js';
import type { LedgerEntry } from './entities/ledgerEntry.entity.js';
import type { TransactionEntity } from './entities/transaction.entity.js';

export function toTransactionDto(t: TransactionEntity, viewerWalletId?: string, entries?: LedgerEntry[]): TransactionDto {
  return {
    id: t.id,
    type: t.type,
    status: t.status,
    walletId: t.walletId,
    receiverWalletId: t.receiverWalletId,
    ...(viewerWalletId ? { direction: directionFor(t, viewerWalletId) } : {}),
    source: { currency: t.sourceCurrency, amount: formatAmount(t.sourceAmount) },
    destination: { currency: t.destCurrency, amount: formatAmount(t.destAmount) },
    rate: t.rate === null ? null : new Dec(t.rate).toFixed(),
    rateSource: t.rateSource,
    rateAsOf: t.rateAsOf ? new Date(t.rateAsOf).toISOString() : null,
    createdAt: t.createdAt.toISOString(),
    ...(entries ? { entries: entries.map(toEntryDto) } : {}),
  };
}

function directionFor(t: TransactionEntity, walletId: string): Direction {
  if (t.type === 'TRANSFER') return t.walletId === walletId ? 'OUT' : 'IN';
  return t.type === 'DEPOSIT' ? 'IN' : 'INTERNAL';
}

function toEntryDto(entry: LedgerEntry): LedgerEntryDto {
  return {
    walletId: entry.walletId,
    currency: entry.currency,
    amount: formatAmount(entry.amount),
    balanceAfter: entry.balanceAfter === null ? null : formatAmount(entry.balanceAfter),
  };
}

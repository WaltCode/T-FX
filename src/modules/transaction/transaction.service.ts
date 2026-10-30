import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { IdempotencyInput } from '../../common/decorators/idempotencyKey.decorator.js';
import { errors } from '../../common/errors/domain.error.js';
import type { Currency } from '../../common/money/currency.js';
import { parseAmount } from '../../common/money/money.js';
import type { FxQuote } from '../../common/types.js';
import { AppConfig } from '../../config/index.js';
import { SYSTEM_WALLETS } from '../../database/systemWallets.js';
import { RedisService } from '../../redis/redis.service.js';
import { cacheKeys } from '../../redis/redisKey.js';
import { FxService } from '../fx/fx.service.js';
import { WalletService } from '../wallet/wallet.service.js';
import type { DepositDto, ListTransactionsQueryDto, SwapDto, TransferDto } from './dto/requests.dto.js';
import type { TransactionDto, TransactionPageDto } from './dto/transaction.dto.js';
import { type IdempotentResult, type Leg, LedgerService, type PostedTransaction } from './ledger.service.js';
import { LedgerEntryRepository } from './repository/ledgerEntry.repository.js';
import { TransactionRepository } from './repository/transaction.repository.js';
import { toTransactionDto } from './transaction.mapper.js';

@Injectable()
export class TransactionService {
  constructor(
    private readonly ledgerService: LedgerService,
    private readonly walletService: WalletService,
    private readonly fxService: FxService,
    private readonly redisService: RedisService,
    private readonly transactionRepository: TransactionRepository,
    private readonly ledgerEntryRepository: LedgerEntryRepository,
  ) {}

  async deposit(walletId: string, dto: DepositDto, idem: IdempotencyInput): Promise<IdempotentResult<TransactionDto>> {
    const amount = parseAmount(dto.amount);
    return this.execute(walletId, idem, [walletId], async (manager) => {
      await this.walletService.assertExists(manager, walletId);
      return this.ledgerService.post(
        manager,
        {
          type: 'DEPOSIT',
          walletId,
          sourceCurrency: dto.currency,
          sourceAmount: amount,
          destCurrency: dto.currency,
          destAmount: amount,
          idempotencyKey: idem.key,
        },
        [
          { walletId: SYSTEM_WALLETS.MINT, currency: dto.currency, amount: -amount },
          { walletId, currency: dto.currency, amount },
        ],
      );
    });
  }

  async swap(walletId: string, dto: SwapDto, idem: IdempotencyInput): Promise<IdempotentResult<TransactionDto>> {
    if (dto.fromCurrency === dto.toCurrency) throw errors.sameCurrencySwap();
    const amount = parseAmount(dto.amount);
    return this.execute(walletId, idem, [walletId], async (manager) => {
      await this.walletService.assertExists(manager, walletId);
      const quote = this.fxService.quote(dto.fromCurrency, dto.toCurrency);
      const received = quote.convert(amount);
      if (received <= 0n) throw errors.amountTooSmall();
      return this.ledgerService.post(
        manager,
        {
          type: 'SWAP',
          walletId,
          sourceCurrency: dto.fromCurrency,
          sourceAmount: amount,
          destCurrency: dto.toCurrency,
          destAmount: received,
          ...rateFields(quote),
          idempotencyKey: idem.key,
        },
        fxLegs(walletId, walletId, dto.fromCurrency, amount, dto.toCurrency, received),
      );
    });
  }

  async transfer(walletId: string, dto: TransferDto, idem: IdempotencyInput): Promise<IdempotentResult<TransactionDto>> {
    if (dto.toWalletId === walletId) throw errors.selfTransfer();
    const destCurrency = dto.destinationCurrency ?? dto.sourceCurrency;
    const amount = parseAmount(dto.amount);
    return this.execute(walletId, idem, [walletId, dto.toWalletId], async (manager) => {
      await this.walletService.assertExists(manager, walletId);
      await this.walletService.assertExists(manager, dto.toWalletId, () => errors.recipientNotFound(dto.toWalletId));
      const base = {
        type: 'TRANSFER' as const,
        walletId,
        counterpartyWalletId: dto.toWalletId,
        sourceCurrency: dto.sourceCurrency,
        sourceAmount: amount,
        destCurrency,
        idempotencyKey: idem.key,
      };
      if (destCurrency === dto.sourceCurrency) {
        return this.ledgerService.post(manager, { ...base, destAmount: amount, rate: '1' }, [
          { walletId, currency: destCurrency, amount: -amount },
          { walletId: dto.toWalletId, currency: destCurrency, amount },
        ]);
      }
      const quote = this.fxService.quote(dto.sourceCurrency, destCurrency);
      const received = quote.convert(amount);
      if (received <= 0n) throw errors.amountTooSmall();
      return this.ledgerService.post(
        manager,
        { ...base, destAmount: received, ...rateFields(quote) },
        fxLegs(walletId, dto.toWalletId, dto.sourceCurrency, amount, destCurrency, received),
      );
    });
  }

  async history(walletId: string, query: ListTransactionsQueryDto): Promise<TransactionPageDto> {
    const limit = query.limit ?? 20;
    const queryHash = createHash('sha1')
      .update(JSON.stringify([query.type ?? null, query.currency ?? null, limit, query.cursor ?? null]))
      .digest('hex');
    return this.redisService.getOrSetForWallet(
      walletId,
      (version) => cacheKeys.walletHistory(walletId, version, queryHash),
      AppConfig.cache.walletTTL,
      async () => {
        await this.walletService.assertExists(this.transactionRepository.manager, walletId);
        const rows = await this.transactionRepository.findHistory(walletId, {
          type: query.type,
          currency: query.currency,
          cursor: query.cursor,
          limit,
        });
        const page = rows.slice(0, limit);
        return {
          data: page.map((t) => toTransactionDto(t, walletId)),
          // pg returns bigint internalId as a string.
          nextCursor: rows.length > limit ? String(page[page.length - 1].internalId) : null,
        };
      },
    );
  }

  async getById(id: string): Promise<TransactionDto> {
    return this.redisService.getOrSet(cacheKeys.transaction(id), AppConfig.cache.transactionTTLSec, async () => {
      const transaction = await this.transactionRepository.findOneBy({ id });
      if (!transaction) throw errors.transactionNotFound(id);
      const entries = await this.ledgerEntryRepository.findForTransaction(id);
      return toTransactionDto(transaction, undefined, entries);
    });
  }

  private async execute(
    walletId: string,
    idem: IdempotencyInput,
    affectedWallets: string[],
    work: (manager: EntityManager) => Promise<PostedTransaction>,
  ): Promise<IdempotentResult<TransactionDto>> {
    const result = await this.ledgerService.runIdempotent<TransactionDto>(
      { scope: walletId, key: idem.key, requestHash: idem.requestHash },
      async (manager) => {
        const { transaction, entries } = await work(manager);
        return { body: toTransactionDto(transaction, walletId, entries), transactionId: transaction.id };
      },
    );
   
    if (!result.replayed) await this.redisService.invalidateWallets(affectedWallets);
    return result;
  }
}

function rateFields(quote: FxQuote) {
  return { rate: quote.rate, rateSource: quote.source, rateAsOf: quote.asOf };
}

function fxLegs(payer: string, payee: string, from: Currency, amount: bigint, to: Currency, received: bigint): Leg[] {
  return [
    { walletId: payer, currency: from, amount: -amount },
    { walletId: SYSTEM_WALLETS.FX_POOL, currency: from, amount },
    { walletId: SYSTEM_WALLETS.FX_POOL, currency: to, amount: -received },
    { walletId: payee, currency: to, amount: received },
  ];
}

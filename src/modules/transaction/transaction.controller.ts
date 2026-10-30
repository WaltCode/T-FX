import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { IdempotencyKey } from '../../common/decorators/idempotencyKey.decorator.js';
import type { IdempotencyInput } from '../../common/decorators/idempotencyKey.decorator.js';
import { RateLimit } from '../../guard/rateLimit.guard.js';
import { DepositDto, ListTransactionsQueryDto, SwapDto, TransferDto } from './dto/requests.dto.js';
import { TransactionDto, TransactionPageDto } from './dto/transaction.dto.js';
import type { IdempotentResult } from './ledger.service.js';
import { TransactionService } from './transaction.service.js';

const IDEMPOTENCY_HEADER = {
  name: 'Idempotency-Key',
  required: true,
  description: 'Unique per logical request (8-255 chars). Retrying with the same key and body returns the original response.',
};

@ApiTags('transactions')
@Controller()
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Post('wallets/:id/deposits')
  @RateLimit('money')
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({ summary: 'Deposit (simulated) a stablecoin into a wallet' })
  @ApiCreatedResponse({ type: TransactionDto })
  @ApiNotFoundResponse({ description: 'WALLET_NOT_FOUND' })
  async deposit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DepositDto,
    @IdempotencyKey() idem: IdempotencyInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TransactionDto> {
    return reply(res, await this.transactionService.deposit(id, dto, idem));
  }

  @Post('wallets/:id/swaps')
  @RateLimit('money')
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({ summary: 'Swap one stablecoin for another inside the same wallet' })
  @ApiCreatedResponse({ type: TransactionDto })
  @ApiUnprocessableEntityResponse({ description: 'INSUFFICIENT_FUNDS, SAME_CURRENCY_SWAP, AMOUNT_TOO_SMALL, IDEMPOTENCY_KEY_REUSED' })
  async swap(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SwapDto,
    @IdempotencyKey() idem: IdempotencyInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TransactionDto> {
    return reply(res, await this.transactionService.swap(id, dto, idem));
  }

  @Post('wallets/:id/transfers')
  @RateLimit('money')
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({ summary: 'Send to another wallet, converting automatically when currencies differ' })
  @ApiCreatedResponse({ type: TransactionDto })
  @ApiNotFoundResponse({ description: 'WALLET_NOT_FOUND or RECIPIENT_NOT_FOUND' })
  @ApiUnprocessableEntityResponse({ description: 'INSUFFICIENT_FUNDS, SELF_TRANSFER, AMOUNT_TOO_SMALL, IDEMPOTENCY_KEY_REUSED' })
  async transfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransferDto,
    @IdempotencyKey() idem: IdempotencyInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TransactionDto> {
    return reply(res, await this.transactionService.transfer(id, dto, idem));
  }

  @Get('wallets/:id/transactions')
  @ApiOperation({ summary: 'Transaction history, newest first, with cursor pagination and filters' })
  @ApiOkResponse({ type: TransactionPageDto })
  history(@Param('id', ParseUUIDPipe) id: string, @Query() query: ListTransactionsQueryDto): Promise<TransactionPageDto> {
    return this.transactionService.history(id, query);
  }

  @Get('transactions/:id')
  @ApiOperation({ summary: 'A single transaction with its ledger entries' })
  @ApiOkResponse({ type: TransactionDto })
  @ApiNotFoundResponse({ description: 'TRANSACTION_NOT_FOUND' })
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<TransactionDto> {
    return this.transactionService.getById(id);
  }
}

function reply<T>(res: Response, result: IdempotentResult<T>): T {
  if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
  return result.body;
}

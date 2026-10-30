import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MoneyDto } from '../../../common/dto/money.dto.js';
import { CURRENCIES } from '../../../common/money/currency.js';
import type { Currency } from '../../../common/money/currency.js';
import { RATE_SOURCES } from '../../../common/types.js';
import type { RateSource } from '../../../common/types.js';
import { TRANSACTION_TYPES } from '../entities/transaction.entity.js';
import type { TransactionStatus, TransactionType } from '../entities/transaction.entity.js';

export type Direction = 'IN' | 'OUT' | 'INTERNAL';

export class LedgerEntryDto {
  @ApiProperty()
  walletId: string;

  @ApiProperty({ enum: [...CURRENCIES] })
  currency: Currency;

  @ApiProperty({ example: '-15500.000000', description: 'Negative = debit, positive = credit' })
  amount: string;

  @ApiProperty({ type: String, nullable: true, description: 'Null for system accounts' })
  balanceAfter: string | null;
}

export class TransactionDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: [...TRANSACTION_TYPES] })
  type: TransactionType;

  @ApiProperty({ enum: ['COMPLETED'] })
  status: TransactionStatus;

  @ApiProperty({ description: 'Initiator: depositor, swapper or sender' })
  walletId: string;

  @ApiProperty({ type: String, nullable: true, description: 'Receiver of a transfer' })
  receiverWalletId: string | null;

  @ApiPropertyOptional({ enum: ['IN', 'OUT', 'INTERNAL'], description: 'Relative to the wallet in the URL' })
  direction?: Direction;

  @ApiProperty({ type: MoneyDto })
  source: MoneyDto;

  @ApiProperty({ type: MoneyDto })
  destination: MoneyDto;

  @ApiProperty({ type: String, nullable: true, example: '0.00064516129032258', description: 'Destination units per source unit' })
  rate: string | null;

  @ApiProperty({ enum: [...RATE_SOURCES], nullable: true })
  rateSource: RateSource | null;

  @ApiProperty({ type: String, nullable: true })
  rateAsOf: string | null;

  @ApiProperty()
  createdAt: string;

  @ApiPropertyOptional({ type: [LedgerEntryDto] })
  entries?: LedgerEntryDto[];
}

export class TransactionPageDto {
  @ApiProperty({ type: [TransactionDto] })
  data: TransactionDto[];

  @ApiProperty({ type: String, nullable: true, description: 'Pass as ?cursor= to get the next page' })
  nextCursor: string | null;
}

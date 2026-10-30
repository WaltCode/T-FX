import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
import { CURRENCIES } from '../../../common/money/currency.js';
import type { Currency } from '../../../common/money/currency.js';
import { AMOUNT_PATTERN } from '../../../common/money/money.js';
import { TRANSACTION_TYPES } from '../entities/transaction.entity.js';
import type { TransactionType } from '../entities/transaction.entity.js';

const AMOUNT_MESSAGE = 'amount must be a positive decimal string with at most 6 decimal places, e.g. "1500.25"';

export class DepositDto {
  @ApiProperty({ enum: [...CURRENCIES], example: 'cNGN' })
  @IsIn([...CURRENCIES])
  currency: Currency;

  @ApiProperty({ example: '155000.00' })
  @IsString()
  @Matches(AMOUNT_PATTERN, { message: AMOUNT_MESSAGE })
  amount: string;
}

export class SwapDto {
  @ApiProperty({ enum: [...CURRENCIES], example: 'cNGN' })
  @IsIn([...CURRENCIES])
  fromCurrency: Currency;

  @ApiProperty({ enum: [...CURRENCIES], example: 'USDx' })
  @IsIn([...CURRENCIES])
  toCurrency: Currency;

  @ApiProperty({ example: '15500', description: 'Amount of fromCurrency to sell' })
  @IsString()
  @Matches(AMOUNT_PATTERN, { message: AMOUNT_MESSAGE })
  amount: string;
}

export class TransferDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  toWalletId: string;

  @ApiProperty({ enum: [...CURRENCIES], example: 'USDx' })
  @IsIn([...CURRENCIES])
  sourceCurrency: Currency;

  @ApiPropertyOptional({ enum: [...CURRENCIES], example: 'cGHS', description: 'Defaults to sourceCurrency' })
  @IsOptional()
  @IsIn([...CURRENCIES])
  destinationCurrency?: Currency;

  @ApiProperty({ example: '5', description: 'Amount of sourceCurrency to send' })
  @IsString()
  @Matches(AMOUNT_PATTERN, { message: AMOUNT_MESSAGE })
  amount: string;
}

export class ListTransactionsQueryDto {
  @ApiPropertyOptional({ enum: [...TRANSACTION_TYPES] })
  @IsOptional()
  @IsIn([...TRANSACTION_TYPES])
  type?: TransactionType;

  @ApiPropertyOptional({ enum: [...CURRENCIES], description: 'Currency that left or entered this wallet' })
  @IsOptional()
  @IsIn([...CURRENCIES])
  currency?: Currency;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'nextCursor from the previous page' })
  @IsOptional()
  @Matches(/^\d{1,18}$/, { message: 'cursor is invalid' })
  cursor?: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { MoneyDto } from '../../../common/dto/money.dto.js';
import { RATE_SOURCES } from '../../../common/types.js';
import type { RateSource } from '../../../common/types.js';

export class TotalUsdDto extends MoneyDto {
  @ApiProperty({ enum: [...RATE_SOURCES] })
  rateSource: RateSource;

  @ApiProperty()
  ratesAsOf: string;
}

export class WalletDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: String, nullable: true, example: 'ada@example.com' })
  email: string | null;

  @ApiProperty({ type: String, nullable: true, example: '+2348012345678' })
  phone: string | null;

  @ApiProperty({ type: [MoneyDto] })
  balances: MoneyDto[];

  @ApiProperty({ type: TotalUsdDto })
  totalUsd: TotalUsdDto;

  @ApiProperty()
  createdAt: string;
}

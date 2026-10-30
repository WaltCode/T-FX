import { ApiProperty } from '@nestjs/swagger';
import { CURRENCIES } from '../../../common/money/currency.js';
import type {Currency} from '../../../common/money/currency.js'
import { RATE_SOURCES } from '../../../common/types.js';
import type {RateSource} from '../../../common/types.js'
export class RateDto {
  @ApiProperty({ enum: [...CURRENCIES] })
  from: Currency;

  @ApiProperty({ enum: [...CURRENCIES] })
  to: Currency;

  @ApiProperty({ description: 'Units of `to` per 1 `from`', example: '0.00064516129032258' })
  rate: string;

  @ApiProperty({ enum: [...RATE_SOURCES] })
  source: RateSource;

  @ApiProperty({ example: '2026-10-29T12:00:00.000Z' })
  fetchedAt: string;
}

export class RatesDto {
  @ApiProperty({ enum: [...CURRENCIES] })
  base: Currency;

  @ApiProperty({ enum: [...RATE_SOURCES] })
  source: RateSource;

  @ApiProperty()
  fetchedAt: string;

  @ApiProperty({ description: 'True when not serving fresh live rates' })
  stale: boolean;

  @ApiProperty({
    description: 'Units of each stablecoin per 1 USDx',
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { USDx: '1', EURx: '0.92', cNGN: '1550', cGHS: '15.5', cXAF: '605' },
  })
  usdRates: Record<Currency, string>;

  @ApiProperty({ type: [RateDto] })
  rates: RateDto[];
}

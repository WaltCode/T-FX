import { ApiProperty } from '@nestjs/swagger';
import { CURRENCIES } from '../money/currency.js';
import type { Currency } from '../money/currency.js';

export class MoneyDto {
  @ApiProperty({ enum: [...CURRENCIES] })
  currency: Currency;

  @ApiProperty({ example: '1500.250000', description: 'Decimal string, 6 dp' })
  amount: string;
}

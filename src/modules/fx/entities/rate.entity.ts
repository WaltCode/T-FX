import { Check, Column, Entity } from 'typeorm';
import type { Currency } from '../../../common/money/currency.js';
import { BaseEntity } from '../../../config/repository/base-entity.js';

@Entity({ name: 'fx_rates' })
@Check('fx_rates_positive', `"per_usd" > 0`)
export class FxRate extends BaseEntity {
  @Column({ type: 'varchar', length: 8, unique: true })
  currency: Currency;

  @Column({ name: 'per_usd', type: 'numeric', precision: 36, scale: 18 })
  perUsd: string;

  @Column({ name: 'fetched_at', type: 'timestamptz' })
  fetchedAt: Date;
}



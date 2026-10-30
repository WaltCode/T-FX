import { Check, Column, Entity, Unique } from 'typeorm';
import type { Currency } from '../../../common/money/currency.js';
import { BaseEntity } from '../../../config/repository/base-entity.js';
import { bigintTransformer } from '../../../database/transaformers.js';

@Entity({ name: 'balances' })
@Unique('balances_wallet_currency_uq', ['walletId', 'currency'])
@Check('balances_non_negative', `"amount" >= 0`)
export class Balance extends BaseEntity {
  @Column({ name: 'wallet_id', type: 'varchar', length: 40 })
  walletId: string;

  @Column({ type: 'varchar', length: 8 })
  currency: Currency;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  amount: bigint;
}

import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CURRENCIES, type Currency } from '../../../common/money/currency.js';
import { TypeOrmRepository } from '../../../config/repository/typeorm.repository.js';
import { Balance } from '../entities/balance.entity.js';

@Injectable()
export class BalanceRepository extends TypeOrmRepository<Balance> {
    constructor(private readonly dataSource: DataSource) {
        super(Balance, dataSource.manager);
    }

    async createZeroBalances(walletId: string): Promise<void> {
        await this.insert(CURRENCIES.map((currency) => ({ id: randomUUID(), walletId, currency, amount: 0n })));
    }

    async applyDelta(walletId: string, currency: Currency, delta: bigint): Promise<bigint | null> {
        const rows = (await this.manager.query(
            `WITH updated AS (
               UPDATE balances SET amount = amount + $3::bigint, "updatedAt" = now()
               WHERE wallet_id = $1 AND currency = $2 AND amount + $3::bigint >= 0
               RETURNING amount
             )
             SELECT amount::text AS amount FROM updated`,
            [walletId, currency, delta.toString()],
        )) as { amount: string }[];
        return rows.length > 0 ? BigInt(rows[0].amount) : null;
    }
}

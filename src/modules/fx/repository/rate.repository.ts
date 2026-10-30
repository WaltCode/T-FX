import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CURRENCIES } from '../../../common/money/currency.js';
import type { FxSnapshot } from '../../../common/types.js';
import { TypeOrmRepository } from '../../../config/repository/typeorm.repository.js';
import { FxRate } from '../entities/rate.entity.js';

@Injectable()
export class FxRateRepository extends TypeOrmRepository<FxRate> {
    constructor(private readonly dataSource: DataSource) {
        super(FxRate, dataSource.manager);
    }

    async saveSnapshot(snapshot: FxSnapshot): Promise<void> {
        const params: unknown[] = [];
        const values = CURRENCIES.map((currency, i) => {
            params.push(randomUUID(), currency, snapshot.perUsd[currency], snapshot.fetchedAt);
            return `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`;
        });
        await this.manager.query(
            `INSERT INTO fx_rates (id, currency, per_usd, fetched_at) VALUES ${values.join(', ')}
             ON CONFLICT (currency) DO UPDATE
             SET per_usd = EXCLUDED.per_usd, fetched_at = EXCLUDED.fetched_at, "updatedAt" = now()`,
            params,
        );
    }
}

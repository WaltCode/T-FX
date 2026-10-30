import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Currency } from '../../../common/money/currency.js';
import { TypeOrmRepository } from '../../../config/repository/typeorm.repository.js';
import { TransactionEntity, type TransactionType } from '../entities/transaction.entity.js';

export interface HistoryFilter {
    type?: TransactionType;
    currency?: Currency;
    cursor?: string;
    limit: number;
}

@Injectable()
export class TransactionRepository extends TypeOrmRepository<TransactionEntity> {
    constructor(private readonly dataSource: DataSource) {
        super(TransactionEntity, dataSource.manager);
    }

    findHistory(walletId: string, filter: HistoryFilter): Promise<TransactionEntity[]> {
        const qb = this.createQueryBuilder('t').where('(t.walletId = :walletId OR t.counterpartyWalletId = :walletId)', {
            walletId,
        });
        if (filter.type) qb.andWhere('t.type = :type', { type: filter.type });
        if (filter.currency) {
            qb.andWhere(
                `((t.walletId = :walletId AND (t.sourceCurrency = :currency OR (t.type <> 'TRANSFER' AND t.destCurrency = :currency)))
                  OR (t.counterpartyWalletId = :walletId AND t.destCurrency = :currency))`,
                { currency: filter.currency },
            );
        }
        if (filter.cursor) qb.andWhere('t.internalId < :cursor', { cursor: filter.cursor });
        return qb.orderBy('t.internalId', 'DESC').limit(filter.limit + 1).getMany();
    }
}

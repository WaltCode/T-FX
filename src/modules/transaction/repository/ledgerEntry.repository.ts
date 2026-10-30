import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TypeOrmRepository } from '../../../config/repository/typeorm.repository.js';
import { LedgerEntry } from '../entities/ledgerEntry.entity.js';

@Injectable()
export class LedgerEntryRepository extends TypeOrmRepository<LedgerEntry> {
    constructor(private readonly dataSource: DataSource) {
        super(LedgerEntry, dataSource.manager);
    }

    findForTransaction(transactionId: string): Promise<LedgerEntry[]> {
        return this.find({ where: { transactionId }, order: { internalId: 'ASC' } });
    }
}

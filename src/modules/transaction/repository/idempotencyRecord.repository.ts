import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TypeOrmRepository } from '../../../config/repository/typeorm.repository.js';
import { IdempotencyRecord } from '../entities/idempotencyRecord.entity.js';

@Injectable()
export class IdempotencyRecordRepository extends TypeOrmRepository<IdempotencyRecord> {
    constructor(private readonly dataSource: DataSource) {
        super(IdempotencyRecord, dataSource.manager);
    }

    async claim(scope: string, key: string, requestHash: string): Promise<boolean> {
        const rows = (await this.manager.query(
            `INSERT INTO idempotency_records (id, scope, key, request_hash) VALUES ($1, $2, $3, $4)
             ON CONFLICT (scope, key) DO NOTHING
             RETURNING key`,
            [randomUUID(), scope, key, requestHash],
        )) as unknown[];
        return rows.length > 0;
    }

    async complete(scope: string, key: string, body: object, transactionId: string): Promise<void> {
        await this.manager.query(
            `UPDATE idempotency_records
             SET response_status = 201, response_body = $3, transaction_id = $4, "updatedAt" = now()
             WHERE scope = $1 AND key = $2`,
            [scope, key, JSON.stringify(body), transactionId],
        );
    }
}

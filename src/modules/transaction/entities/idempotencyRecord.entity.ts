import { Column, Entity, Unique } from 'typeorm';
import { BaseEntity } from '../../../config/repository/base-entity.js';

@Entity({ name: 'idempotency_records' })
@Unique('idempotency_records_scope_key_uq', ['scope', 'key'])
export class IdempotencyRecord extends BaseEntity {
  @Column({ type: 'varchar', length: 64 })
  scope: string;

  @Column({ type: 'varchar', length: 255 })
  key: string;

  @Column({ name: 'request_hash', type: 'varchar', length: 64 })
  requestHash: string;

  @Column({ name: 'response_status', type: 'int', nullable: true })
  responseStatus: number | null;

  @Column({ name: 'response_body', type: 'jsonb', nullable: true })
  responseBody: Record<string, unknown> | null;

  @Column({ name: 'transaction_id', type: 'varchar', length: 40, nullable: true })
  transactionId: string | null;
}

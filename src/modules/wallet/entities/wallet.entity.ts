import { Check, Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../config/repository/base-entity.js';

@Entity({ name: 'wallets' })
@Check('wallets_identity_chk', `"email" IS NOT NULL OR "phone" IS NOT NULL`)
export class Wallet extends BaseEntity {
  @Column({ type: 'varchar', length: 254, nullable: true, unique: true })
  email: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true, unique: true })
  phone: string | null;
}

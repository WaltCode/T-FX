import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TypeOrmRepository } from '../../../config/repository/typeorm.repository.js';
import { Wallet } from '../entities/wallet.entity.js';

@Injectable()
export class WalletRepository extends TypeOrmRepository<Wallet> {
    constructor(private readonly dataSource: DataSource) {
        super(Wallet, dataSource.manager);
    }
}

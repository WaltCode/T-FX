import { Module } from '@nestjs/common';
import { FxModule } from '../fx/fx.module.js';
import { BalanceRepository } from './repository/balance.repository.js';
import { WalletRepository } from './repository/wallet.repository.js';
import { WalletController } from './wallet.controller.js';
import { WalletService } from './wallet.service.js';

@Module({
  imports: [FxModule],
  controllers: [WalletController],
  providers: [WalletService, WalletRepository, BalanceRepository],
  exports: [WalletService, BalanceRepository],
})
export class WalletModule {}

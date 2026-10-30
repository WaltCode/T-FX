import { Module } from '@nestjs/common';
import { OpenErApiProvider } from '../../common/providers/open-er-api.provider.js';
import { StaticFxProvider } from '../../common/providers/static.provider.js';
import { FX_PROVIDER, type FxProvider } from '../../common/types.js';
import { AppConfig } from '../../config/index.js';
import { FxController } from './fx.controller.js';
import { FxService } from './fx.service.js';
import { FxRateRepository } from './repository/rate.repository.js';

@Module({
  controllers: [FxController],
  providers: [
    FxService,
    FxRateRepository,
    {
      provide: FX_PROVIDER,
      useFactory: (): FxProvider =>
        AppConfig.fx.provider === 'static' ? new StaticFxProvider() : new OpenErApiProvider(),
    },
  ],
  exports: [FxService],
})
export class FxModule {}

import { Module } from '@nestjs/common';
import { FxModule } from '../fx/fx.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [FxModule],
  controllers: [HealthController],
})
export class HealthModule {}

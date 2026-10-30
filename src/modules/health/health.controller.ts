import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { RedisService } from '../../redis/redis.service.js';
import { FxService } from '../fx/fx.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    private readonly fxService: FxService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Database, Redis and FX freshness. 503 only when the database is down.' })
  async check(@Res({ passthrough: true }) res: Response) {
    const [dbUp, redisUp] = await Promise.all([
      this.dataSource.query('SELECT 1').then(
        () => true,
        () => false,
      ),
      this.redisService.ping(),
    ]);
    const { snapshot, source } = this.fxService.current();
    if (!dbUp) res.status(503);
    return {
      status: dbUp ? 'ok' : 'degraded',
      db: dbUp ? 'up' : 'down',
      redis: redisUp ? 'up' : 'down',
      fx: { source, fetchedAt: snapshot.fetchedAt },
    };
  }
}

import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { errors } from '../common/errors/domain.error.js';
import { cacheKeys } from '../redis/redisKey.js';
import { AppConfig } from '../config/index.js';
import { RedisService } from '../redis/redis.service.js';

export type RateLimitPolicy = 'walletCreate' | 'money';

const POLICY_KEY = 'rateLimitPolicy';

export const RateLimit = (policy: RateLimitPolicy) => SetMetadata(POLICY_KEY, policy);

interface Rule {
  name: string;
  subject: string;
  limit: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly config = AppConfig
  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const limits = this.config.rateLimit;
    const ip = req.ip ?? 'unknown';

    const rules: Rule[] = [{ name: 'global', subject: ip, limit: limits.global }];
    const policy = this.reflector.get<RateLimitPolicy | undefined>(POLICY_KEY, context.getHandler());
    if (policy === 'walletCreate') rules.push({ name: 'wallet-create', subject: ip, limit: limits.walletCreation });
    if (policy === 'money') {
      rules.push({ name: 'money', subject: String(req.params.id).slice(0, 64), limit: limits.money });
    }

    for (const rule of rules) {
      const hit = await this.redisService.hitRateLimit(cacheKeys.rateLimit(rule.name, rule.subject), limits.windowMs);
      if (!hit) return true; 
      const [count, ttlMs] = hit;
      const resetSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
      res.setHeader('X-RateLimit-Limit', rule.limit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, rule.limit - count));
      res.setHeader('X-RateLimit-Reset', resetSeconds);
      if (count > rule.limit) {
        res.setHeader('Retry-After', resetSeconds);
        throw errors.rateLimited(rule.name, resetSeconds);
      }
    }
    return true;
  }
}

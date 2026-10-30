import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient, RedisClientType } from 'redis';
import { AppConfig } from '../config/index.js';
import { FailOpen } from './failOpen.js';
import { cacheKeys } from './redisKey.js';

const VERSION_TTL_SEC = 7 * 24 * 60 * 60;
const STARTUP_WAIT_MS = 2000;

// Fixed-window counter. INCR and PEXPIRE run atomically, so instances can't both read the same count.
const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return { count, redis.call('PTTL', KEYS[1]) }
`;

/**
 * Redis backs caching, rate limiting and FX sharing only, never money correctness.
 * Every helper fails open: when Redis is unavailable it returns undefined (or loads from the database)
 * instead of throwing.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RedisService.name);
    private readonly failOpen = new FailOpen(this.logger, 'serving from the database')
    private readonly client: RedisClientType = createClient({
        url: AppConfig.redis.url,
        // Commands fail immediately while disconnected instead of queueing, so callers can fail open.
        disableOfflineQueue: true,
        socket: {
            connectTimeout: STARTUP_WAIT_MS,
            reconnectStrategy: (retries) => {
                const baseDelay = Math.min(100 * 2 ** retries, 5000);
                const jitter = Math.floor(Math.random() * 500);
                const delay = baseDelay + jitter;

                this.logger.warn(
                    `Redis reconnect attempt ${retries}, retrying in ${delay}ms`,
                );

                return delay;
            },
        },
    });
    /** Pub/sub needs its own connection; it keeps an offline queue so subscriptions survive reconnects. */
    private readonly subscriber = this.client.duplicate({ disableOfflineQueue: false }) as RedisClientType;

    constructor() {
        this.client.on('connect', () => {
            this.logger.log('Connecting to Redis...');
        });

        this.client.on('ready', () => {
            this.logger.log('Redis connection established');
        });

        this.client.on('reconnecting', () => {
            this.logger.warn('Reconnecting to Redis...');
        });

        this.client.on('error', (error: Error) => {
            this.logger.error(`Redis error: ${error.message}`);
        });

        this.client.on('end', () => {
            this.logger.warn('Redis connection closed');
        });

        this.subscriber.on('error', (error: Error) => {
            this.logger.error(`Redis subscriber error: ${error.message}`);
        });
    }

    /** Waits briefly for Redis but never blocks startup: the app runs without it and the client keeps reconnecting. */
    async onModuleInit() {
        const connecting = Promise.all([this.client.connect(), this.subscriber.connect()]).catch((error: unknown) => {
            this.logger.error(
                'Initial Redis connection failed',
                error instanceof Error ? error.stack : String(error),
            );
        });
        await Promise.race([connecting, delay(STARTUP_WAIT_MS)]);
        if (!this.client.isReady) this.logger.warn('Redis not ready; continuing without cache and rate limiting');
    }

    async onModuleDestroy() {
        for (const connection of [this.client, this.subscriber]) {
            // quit() waits for the server; a client that never connected would queue it forever.
            if (connection.isReady) {
                await connection.quit().catch(() => connection.destroy());
            } else if (connection.isOpen) {
                connection.destroy();
            }
        }
    }

    async getOrSet<T>(key: string, ttlSec: number, load: () => Promise<T>): Promise<T> {
      const cached = await this.failOpen.run(() => this.client.get(key));
      if (typeof cached === 'string') return JSON.parse(cached) as T;
      const value = await load();
      await this.failOpen.run(() =>
        this.client.set(key, JSON.stringify(value), { expiration: { type: 'EX', value: ttlSec } }),
      );
      return value;
    }

    /**
     * Cache-aside under the wallet's current version. The version is read before the database, so a reader
     * racing a commit writes under the old version, which nothing reads any more.
     */
    async getOrSetForWallet<T>(
      walletId: string,
      keyFor: (version: string) => string,
      ttlSec: number,
      load: () => Promise<T>,
    ): Promise<T> {
      const version = await this.failOpen.run(() => this.client.get(cacheKeys.walletVersion(walletId)));
      if (version === undefined) return load();
      return this.getOrSet(keyFor(version ?? '0'), ttlSec, load);
    }

    /** Call only after COMMIT. One INCR invalidates every cached view of each wallet. */
    async invalidateWallets(walletIds: Iterable<string>): Promise<void> {
      const pipeline = this.client.multi();
      for (const id of new Set(walletIds)) {
        pipeline.incr(cacheKeys.walletVersion(id)).expire(cacheKeys.walletVersion(id), VERSION_TTL_SEC);
      }
      await this.failOpen.run(() => pipeline.exec());
    }

    /** Counts one hit in the current window. Returns [count, msUntilReset], or undefined if Redis is down. */
    async hitRateLimit(key: string, windowMs: number): Promise<[number, number] | undefined> {
      return this.failOpen.run(
        async () =>
          (await this.client.eval(RATE_LIMIT_SCRIPT, { keys: [key], arguments: [String(windowMs)] })) as [number, number],
      );
    }

    /** true if acquired, false if someone else holds it, undefined if Redis is down. */
    async acquireLock(key: string, owner: string, ttlMs: number): Promise<boolean | undefined> {
      const result = await this.failOpen.run(() =>
        this.client.set(key, owner, { expiration: { type: 'PX', value: ttlMs }, condition: 'NX' }),
      );
      return result === undefined ? undefined : result === 'OK';
    }

    async getValue(key: string): Promise<string | null | undefined> {
      return this.failOpen.run(() => this.client.get(key));
    }

    async setValue(key: string, value: string, ttlMs: number): Promise<void> {
      await this.failOpen.run(() => this.client.set(key, value, { expiration: { type: 'PX', value: ttlMs } }));
    }

    async publish(channel: string, message: string): Promise<void> {
      await this.failOpen.run(() => this.client.publish(channel, message));
    }

    /** Doesn't wait for Redis: the subscription is queued and re-established after reconnects. */
    subscribe(channel: string, onMessage: (message: string) => void): void {
      this.subscriber.subscribe(channel, (message: string) => onMessage(message)).catch((error: unknown) => {
        this.logger.warn(`Subscribe to ${channel} failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }

    async ping(): Promise<boolean> {
      return (await this.failOpen.run(() => this.client.ping())) !== undefined;
    }

    async del(key: string) {
        return this.client.del(key);
    }

    async exists(key: string) {
        return this.client.exists(key);
    }

    async getDel(key: string) {
        return this.client.getDel(key) as Promise<string | null>;
    }

    async getClient() {
        return this.client
    }
}

import { DynamicModule, Global, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { TOKENS } from '../../constants/tokens';
import { RedisService } from './redis.service';

export interface RedisModuleOptions {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  /** 统一 key 前缀,避免与其他用途的 key 冲突 */
  keyPrefix?: string;
}

/**
 * Redis 底座模块 —— 幂等/分布式锁/Outbox 的公共依赖。
 *
 * 设计:
 *  - @Global + 在 SharedModule.forRoot 里按需挂载,接入方无需感知;
 *  - lazyConnect:先用延迟连接,由 RedisService.onModuleInit 主动连接、
 *    ping 探活,连接失败只告警不阻塞启动(演示环境 Redis 可能未启动);
 *  - onApplicationShutdown 时断开连接(优雅关闭,复用生命周期钩子)。
 */
@Global()
@Module({})
export class RedisModule {
  static forRoot(options: RedisModuleOptions = {}): DynamicModule {
    const redisProvider = {
      provide: TOKENS.REDIS_CLIENT,
      useFactory: () =>
        new Redis({
          host: options.host ?? 'localhost',
          port: options.port ?? 6379,
          password: options.password,
          db: options.db,
          keyPrefix: options.keyPrefix ?? 'shared:',
          lazyConnect: true,
          maxRetriesPerRequest: 3,
          enableOfflineQueue: true,
        }),
    };

    return {
      module: RedisModule,
      global: true,
      providers: [redisProvider, RedisService],
      exports: [redisProvider, RedisService],
    };
  }
}
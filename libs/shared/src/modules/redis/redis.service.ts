import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { TOKENS } from '../../constants/tokens';

/**
 * Redis 连接守卫 —— 管理连接生命周期。
 *
 * 为什么单独一个 Service 而不直接用 provider:
 *  - 连接时机要可控:模块实例化后立刻 connect,失败打告警而非让应用崩掉;
 *  - 关闭时机要可靠:应用退出前 disconnect,避免悬挂连接;
 *  - 业务代码永远只依赖 TOKENS.REDIS_CLIENT 或本 Service,不直接 new Redis。
 */
@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(TOKENS.REDIS_CLIENT) private readonly client: Redis) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
      await this.client.ping();
      this.logger.log('Redis 连接成功');
    } catch (err) {
      this.logger.warn(
        `Redis 连接失败(演示环境可忽略,幂等/锁/Outbox 将不可用): ${
          (err as Error).message
        }`,
      );
    }
  }

  /** 获取底层 ioredis 客户端(高级用法) */
  getClient(): Redis {
    return this.client;
  }

  async onApplicationShutdown(): Promise<void> {
    this.client.disconnect();
    this.logger.log('Redis 连接已断开');
  }
}
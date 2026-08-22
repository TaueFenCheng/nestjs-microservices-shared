import { DynamicModule, Global, Module, Type } from '@nestjs/common';
import { DatabaseModule, DatabaseOptions } from './modules/database/database.module';
import { AuthModule, AuthModuleOptions } from './modules/auth/auth.module';
import { LoggerModule } from './modules/logger/logger.module';
import { HealthModule } from './modules/health/health.module';
import { RedisModule, RedisModuleOptions } from './modules/redis/redis.module';
import { IdempotencyModule } from './modules/idempotency/idempotency.module';
import { LockModule } from './modules/lock/lock.module';
import { OutboxModule, OutboxModuleOptions } from './modules/outbox/outbox.module';

export interface SharedModuleOptions {
  /** 应用名(日志标识) */
  appName: string;
  /** 数据库配置;传 null 表示该服务不需要数据库 */
  database?: DatabaseOptions | null;
  /** 鉴权配置(JWT);传 null 表示不需要鉴权 */
  auth?: AuthModuleOptions | null;
  /** 可靠性三件套(Redis 底座 + 幂等 + 分布式锁 + Outbox);传 null 表示不需要 */
  reliability?: {
    redis?: RedisModuleOptions;
    outbox?: OutboxModuleOptions;
  } | null;
}

/**
 * 聚合模块 —— 微服务的"一行接入"入口。
 *
 * 每个微服务的 AppModule 只需:
 *   SharedModule.forRoot({ appName: 'orders', database: {...}, auth: {...} })
 *
 * 内部编排好:全局日志 + 数据库 + 鉴权 + 健康检查。
 * 这是"抽离公共模块"的最终形态:接入方几乎零样板代码。
 */
@Global()
@Module({})
export class SharedModule {
  static forRoot(options: SharedModuleOptions): DynamicModule {
    const imports: Array<Type<unknown> | DynamicModule> = [
      LoggerModule.forRoot({ appName: options.appName }),
      HealthModule,
    ];

    if (options.database) {
      imports.push(DatabaseModule.forRoot(options.database));
    }
    if (options.auth) {
      imports.push(AuthModule.forRoot(options.auth));
    }
    // 可靠性底座:Redis 连接 + 幂等 + 分布式锁(可选 Outbox)
    if (options.reliability?.redis) {
      imports.push(RedisModule.forRoot(options.reliability.redis));
      imports.push(IdempotencyModule, LockModule);
      if (options.reliability.outbox) {
        imports.push(OutboxModule.forRoot(options.reliability.outbox));
      }
    }

    return {
      module: SharedModule,
      global: true,
      imports,
      exports: imports,
    };
  }
}

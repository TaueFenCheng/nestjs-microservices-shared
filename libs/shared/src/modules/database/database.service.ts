import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { DatabaseOptions } from './database.module';

/** 简化版连接句柄;生产环境这里应是 DataSource / Pool / PrismaClient */
export interface DatabaseConnection {
  healthy(): Promise<boolean>;
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
}

/**
 * 数据库服务。
 * 演示要点:
 *  - 通过注入 'DATABASE_CONNECTION' 拿到 useFactory 创建的连接(自定义 provider);
 *  - 实现 OnApplicationShutdown 做优雅关闭(生命周期钩子);
 *  - 生产接入 TypeORM: 改为注入 DataSource,并用 getDataSourceToken 命名多连接。
 */
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  constructor(
    @Inject('DATABASE_CONNECTION') private readonly connection: DatabaseConnection,
  ) {}

  /** 由 useFactory 调用,创建内存连接(示例) */
  static createConnection(options: DatabaseOptions): DatabaseConnection {
    if (options.type === 'memory') {
      return {
        async healthy() {
          return true;
        },
        async query<T = unknown>(sql: string): Promise<T[]> {
          // 示例实现:仅记录,真实场景替换为驱动调用
          return [] as T[];
        },
      };
    }
    // 真实实现:new Pool({ host, port, ... }) / mysql.createPool / PrismaClient
    throw new Error(
      `transport type "${options.type}" 未接入,请实现真实连接或使用 memory`,
    );
  }

  async ping(): Promise<boolean> {
    return this.connection.healthy();
  }

  async onApplicationShutdown() {
    // 关闭连接池(演示用)
  }
}

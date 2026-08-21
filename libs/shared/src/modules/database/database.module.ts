import { DynamicModule, InjectionToken, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';

export interface DatabaseOptions {
  type: 'memory' | 'postgres' | 'mysql';
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  /** 连接池大小 */
  poolSize?: number;
}

/**
 * 数据库模块 —— 动态模块最佳实践示例。
 *
 * 同一个公共模块,每个微服务通过 forRoot 传入自己的配置:
 *   OrdersModule  -> DatabaseModule.forRoot({ type: 'postgres', host: 'db-orders', ... })
 *   BillingModule -> DatabaseModule.forRoot({ type: 'postgres', host: 'db-billing', ... })
 *
 * 高级特性演示:
 *  - forRoot():静态初始化,返回 DynamicModule;
 *  - forRootAsync():异步初始化,依赖 ConfigService(见下方注释);
 *  - 自定义 provider useFactory:按配置创建"连接"对象。
 */
@Module({})
export class DatabaseModule {
  static forRoot(options: DatabaseOptions): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        { provide: 'DATABASE_OPTIONS', useValue: options },
        {
          provide: 'DATABASE_CONNECTION',
          useFactory: (opts: DatabaseOptions) => DatabaseService.createConnection(opts),
          inject: ['DATABASE_OPTIONS'],
        },
        DatabaseService,
      ],
      exports: [DatabaseService],
      global: true,
    };
  }

  /** 异步版:配置从 ConfigModule 读取,注入到 useFactory */
  static forRootAsync(options: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useFactory: (...args: any[]) => DatabaseOptions | Promise<DatabaseOptions>;
    inject: InjectionToken[];
  }): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: 'DATABASE_OPTIONS',
          useFactory: options.useFactory,
          inject: options.inject,
        },
        {
          provide: 'DATABASE_CONNECTION',
          useFactory: (opts: DatabaseOptions) => DatabaseService.createConnection(opts),
          inject: ['DATABASE_OPTIONS'],
        },
        DatabaseService,
      ],
      exports: [DatabaseService],
      global: true,
    };
  }
}

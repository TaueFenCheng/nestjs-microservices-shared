import { DynamicModule, InjectionToken, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
  /** TypeORM 同步 schema(生产建议 false,用 migration) */
  synchronize?: boolean;
}

/**
 * 数据库模块 —— 动态模块最佳实践示例。
 *
 * 同一公共模块,每个微服务通过 forRoot 传入自己的配置:
 *   OrdersModule  -> DatabaseModule.forRoot({ type: 'postgres', host: 'db-orders', ... })
 *   BillingModule -> DatabaseModule.forRoot({ type: 'memory', ... })  // 演示可多态
 *
 * 两种后端:
 *  - memory:教学用内存连接(演示自定义 provider / useFactory);
 *  - postgres:TypeORM + @nestjs/typeorm(真实工程,实体、事务、乐观锁、migration)。
 */
@Module({})
export class DatabaseModule {
  static forRoot(options: DatabaseOptions): DynamicModule {
    if (options.type === 'postgres') {
      return this.forPostgres(options);
    }
    return this.forMemory(options);
  }

  /** 内存模式:保留原教学实现(自定义 provider + DatabaseService) */
  private static forMemory(options: DatabaseOptions): DynamicModule {
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

  /** PostgreSQL 模式:TypeORM 能力(实体注册用所在模块 forFeature,全局可用) */
  private static forPostgres(options: DatabaseOptions): DynamicModule {
    return {
      module: DatabaseModule,
      global: true,
      imports: [
        TypeOrmModule.forRootAsync({
          useFactory: () => ({
            type: 'postgres' as const,
            host: options.host ?? 'localhost',
            port: options.port ?? 5432,
            username: options.user ?? 'postgres',
            password: options.password ?? 'postgres',
            database: options.database ?? 'nestjs_microservices',
            autoLoadEntities: true, // 由各模块 forFeature 自动注册实体
            synchronize: options.synchronize ?? false, // 生产用 migration
            logging: ['error'],
            // 连接池
            extra: { max: options.poolSize ?? 10 },
          }),
        }),
      ],
      exports: [],
    };
  }
}
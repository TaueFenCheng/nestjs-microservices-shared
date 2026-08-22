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
  /** 只读副本(读写分离):每个副本注册为命名 DataSource,如 [{ name: 'slave' }] */
  replicas?: Array<{ name: string; host?: string; port?: number; user?: string; password?: string; database?: string }>;
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
    const imports: unknown[] = [
      TypeOrmModule.forRootAsync({
        useFactory: () => this.postgresSource(options),
      }),
    ];

    // 只读副本(读写分离):额外注册命名 DataSource,业务用 @InjectDataSource('slave') 注入
    for (const replica of options.replicas ?? []) {
      imports.push(
        TypeOrmModule.forRootAsync({
          name: replica.name,
          useFactory: () => this.postgresSource({ ...options, ...replica }),
        }),
      );
    }

    return {
      module: DatabaseModule,
      global: true,
      imports: imports as DynamicModule[],
      exports: [],
    };
  }

  /** TypeORM 连接配置(主库/只读副本共用) */
  private static postgresSource(options: DatabaseOptions) {
    return {
      type: 'postgres' as const,
      host: options.host ?? 'localhost',
      port: options.port ?? 5432,
      username: options.user ?? 'postgres',
      password: options.password ?? 'postgres',
      database: options.database ?? 'nestjs_microservices',
      autoLoadEntities: true,
      synchronize: options.synchronize ?? false,
      logging: ['error'] as ('error' | 'query' | 'warn')[],
      extra: { max: options.poolSize ?? 10 },
    };
  }
}
import { DynamicModule, Global, Module, Type } from '@nestjs/common';
import { DatabaseModule, DatabaseOptions } from './modules/database/database.module';
import { AuthModule, AuthModuleOptions } from './modules/auth/auth.module';
import { LoggerModule } from './modules/logger/logger.module';
import { HealthModule } from './modules/health/health.module';

export interface SharedModuleOptions {
  /** 应用名(日志标识) */
  appName: string;
  /** 数据库配置;传 null 表示该服务不需要数据库 */
  database?: DatabaseOptions | null;
  /** 鉴权配置(JWT);传 null 表示不需要鉴权 */
  auth?: AuthModuleOptions | null;
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

    return {
      module: SharedModule,
      global: true,
      imports,
      exports: imports,
    };
  }
}

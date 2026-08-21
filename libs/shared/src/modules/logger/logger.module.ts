import { Global, Module } from '@nestjs/common';
import { LoggerService } from './logger.service';

/**
 * 全局日志模块。
 * 设计要点:
 *  1. @Global() —— 任何微服务无需 import 即可注入 LoggerService;
 *  2. 各服务启动时通过 LoggerModule.forRoot({ appName }) 传入自己的服务名,
 *     日志行统一带上 service 字段,便于日志中心按服务过滤;
 *  3. 生产环境可在此接入 pino / winston 的 transport(见 LoggerService 注释)。
 */
@Global()
@Module({
  providers: [LoggerService],
  exports: [LoggerService],
})
export class LoggerModule {
  static forRoot(options?: { appName?: string }) {
    return {
      global: true,
      module: LoggerModule,
      providers: [
        {
          provide: 'LOGGER_OPTIONS',
          useValue: { appName: options?.appName ?? 'unknown-service' },
        },
      ],
    };
  }
}

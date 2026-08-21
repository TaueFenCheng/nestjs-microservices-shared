import { Inject, Injectable, Logger as NestLogger, Optional } from '@nestjs/common';

export interface LoggerOptions {
  appName: string;
}

/**
 * 统一日志服务。
 * 生产环境建议:
 *  - 接入 @nestjs/pino 或 winston,把结构化 JSON 日志推到 ELK/Loki;
 *  - 本示例保持轻量:基于 Nest 内置 Logger,但统一了格式与服务标识。
 */
@Injectable()
export class LoggerService extends NestLogger {
  constructor(
    @Optional() @Inject('LOGGER_OPTIONS') private readonly opts?: LoggerOptions,
  ) {
    super(opts?.appName ?? 'app');
  }

  /** 带请求上下文的结构化日志 */
  logWithContext(message: string, context: { requestId?: string; [k: string]: unknown } = {}) {
    super.log(JSON.stringify({ message, ...context }), this.opts?.appName);
  }

  warnWithContext(message: string, context: { requestId?: string; [k: string]: unknown } = {}) {
    super.warn(JSON.stringify({ message, ...context }), this.opts?.appName);
  }

  errorWithContext(
    message: string,
    trace?: string,
    context: { requestId?: string; [k: string]: unknown } = {},
  ) {
    super.error(JSON.stringify({ message, ...context }), trace, this.opts?.appName);
  }
}

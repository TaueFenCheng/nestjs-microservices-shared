import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * 请求日志拦截器 —— 记录每个请求的耗时与结果。
 * 生产可扩展:接入 opentelemetry 做分布式追踪(见 docs/05-advanced-features.md)。
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<{ method: string; url: string; id?: string }>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () =>
          this.logger.log(
            `${request.method} ${request.url} ${Date.now() - startedAt}ms (requestId: ${request.id ?? '-'})`,
          ),
        error: (err: Error) =>
          this.logger.error(
            `${request.method} ${request.url} failed in ${Date.now() - startedAt}ms: ${err.message}`,
          ),
      }),
    );
  }
}

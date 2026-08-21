import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Observable } from 'rxjs';
import { RequestContext } from '../utils/request-context';

/**
 * 请求 ID 拦截器 —— 链路追踪基础。
 * 1. 读取上游 X-Request-Id,没有则生成 UUID;
 * 2. 写入 AsyncLocalStorage(RequestContext),后续所有服务/日志可读取;
 * 3. 响应头回写 X-Request-Id,前端可据此关联日志。
 */
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<{ headers: Record<string, string> }>();
    const response = http.getResponse<{ setHeader: (k: string, v: string) => void }>();

    const incoming = request.headers['x-request-id'];
    const requestId = Array.isArray(incoming) ? incoming[0] : (incoming ?? randomUUID());

    return RequestContext.run(requestId, () => {
      response.setHeader('X-Request-Id', requestId);
      return next.handle();
    });
  }
}

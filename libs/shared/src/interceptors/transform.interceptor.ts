import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { success, ServiceResponse } from '../dto/service-response.dto';
import { RequestContext } from '../utils/request-context';

/**
 * 响应转换拦截器 —— 统一响应包装。
 * 控制器只需 return 业务数据,拦截器统一包成:
 *   { code: 0, message: 'ok', data: ..., requestId, timestamp }
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ServiceResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<ServiceResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        ...success(data),
        requestId: RequestContext.getId(),
      })),
    );
  }
}

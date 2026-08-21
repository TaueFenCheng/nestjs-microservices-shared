import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { ErrorCode } from '../constants/error-codes';

/**
 * 微服务端异常过滤器。
 * 微服务抛出的错误会被包装成结构化响应返回给调用方(网关),
 * 网关据此映射为 HTTP 状态码。
 *
 * 用法(在微服务 main.ts 注册):
 *   app.useGlobalFilters(new RpcExceptionFilter());
 *
 * 注意:如果使用 Kafka/gRPC,错误可能通过 KafkaHeaders.CORRELATION_ID
 * 关联回调用方;此处保持通用实现。
 */
@Catch(RpcException)
export class RpcExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(RpcExceptionFilter.name);

  catch(exception: RpcException, host: ArgumentsHost) {
    const error = exception.getError();
    const payload =
      typeof error === 'string'
        ? { code: ErrorCode.INTERNAL_ERROR, message: error }
        : (error as { code?: number; message?: string });

    this.logger.warn(`Rpc exception: ${JSON.stringify(payload)}`);

    // RpcException 会原样返回给调用方;这里记录日志后重新抛出等价对象
    // 实际业务中通常直接在服务内 throw new RpcException({ code, message })
    return payload;
  }
}

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ErrorCode, errorCodeToHttpStatus } from '../constants/error-codes';
import { failure } from '../dto/service-response.dto';

/**
 * 全局异常过滤器 —— 统一错误响应格式。
 * 所有未捕获异常最终走这里,输出 { code, message, data, timestamp }。
 *
 * 高级特性:
 *  - 使用 @Catch() 捕获所有异常(可指定类型列表 @Catch(TypeA, TypeB));
 *  - 区分 HttpException / 业务错误码 / 未知错误;
 *  - 隐藏内部堆栈,避免泄露实现细节。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ id?: string; url?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: number = ErrorCode.INTERNAL_ERROR;
    let message = '服务器内部错误';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else {
        const obj = body as { message?: string | string[]; error?: string };
        message = Array.isArray(obj.message) ? obj.message.join('; ') : (obj.message ?? obj.error ?? message);
      }
      code = status === HttpStatus.BAD_REQUEST ? ErrorCode.BAD_REQUEST : status;
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled exception on ${request.url}`, exception.stack);
    }

    response.status(status).json(
      failure(code as ErrorCode, message, null) as unknown as {
        code: number;
        message: string;
        timestamp: string;
      } & Record<string, unknown>,
    );
  }
}

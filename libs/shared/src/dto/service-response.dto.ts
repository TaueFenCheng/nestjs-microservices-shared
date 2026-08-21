import { ErrorCode } from '../constants/error-codes';

/**
 * 统一响应包装(配合 TransformInterceptor 使用)。
 * 所有 HTTP 接口返回形如:
 * { code: 0, message: 'ok', data: ... , requestId: 'xxx' }
 */
export interface ServiceResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
  requestId?: string;
  timestamp: string;
}

export function success<T>(data: T, message = 'ok'): ServiceResponse<T> {
  return {
    code: ErrorCode.OK,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
}

export function failure(
  code: ErrorCode | number,
  message: string,
  data: unknown = null,
): ServiceResponse<unknown> {
  return { code, message, data, timestamp: new Date().toISOString() };
}

/**
 * 全局统一错误码表。
 * 规则:
 *  - 0         = 成功
 *  - 1xxx      = 通用错误(参数、未授权、服务内部)
 *  - 2xxx      = 订单域
 *  - 3xxx      = 支付/计费域
 *  - 4xxx      = 用户/鉴权域
 * 所有微服务必须使用同一套错误码,否则调用方无法解释失败原因。
 */
import { HttpStatus } from '@nestjs/common';

export enum ErrorCode {
  // 通用
  OK = 0,
  BAD_REQUEST = 1000,
  UNAUTHORIZED = 1001,
  FORBIDDEN = 1002,
  NOT_FOUND = 1003,
  CONFLICT = 1004,
  INTERNAL_ERROR = 1500,
  SERVICE_UNAVAILABLE = 1503,
  TIMEOUT = 1504,

  // 订单域
  ORDER_NOT_FOUND = 2001,
  ORDER_STATUS_INVALID = 2002,
  ORDER_AMOUNT_MISMATCH = 2003,

  // 支付/计费域
  PAYMENT_FAILED = 3001,
  PAYMENT_ALREADY_PAID = 3002,
  INSUFFICIENT_BALANCE = 3003,

  // 用户/鉴权域
  USER_NOT_FOUND = 4001,
  INVALID_CREDENTIALS = 4002,
  TOKEN_EXPIRED = 4003,
  TOKEN_INVALID = 4004,
}

/** 错误码 -> HTTP 状态映射(网关统一出口用) */
export function errorCodeToHttpStatus(code: ErrorCode): HttpStatus {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison

  switch (code) {
    case ErrorCode.BAD_REQUEST:
    case ErrorCode.ORDER_STATUS_INVALID:
    case ErrorCode.ORDER_AMOUNT_MISMATCH:
      return HttpStatus.BAD_REQUEST;
    case ErrorCode.UNAUTHORIZED:
    case ErrorCode.TOKEN_EXPIRED:
    case ErrorCode.TOKEN_INVALID:
    case ErrorCode.INVALID_CREDENTIALS:
      return HttpStatus.UNAUTHORIZED;
    case ErrorCode.FORBIDDEN:
      return HttpStatus.FORBIDDEN;
    case ErrorCode.NOT_FOUND:
    case ErrorCode.ORDER_NOT_FOUND:
    case ErrorCode.USER_NOT_FOUND:
      return HttpStatus.NOT_FOUND;
    case ErrorCode.CONFLICT:
    case ErrorCode.PAYMENT_ALREADY_PAID:
      return HttpStatus.CONFLICT;
    default:
      return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}

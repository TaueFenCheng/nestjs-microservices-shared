import { HttpStatus } from '@nestjs/common';

/**
 * 微服务调用请求的统一载体。
 * 建议所有跨服务方法调用都使用 { cmd, data } 结构,
 * 这样 transport 从 Redis 切换成 Kafka/gRPC 时业务代码零改动。
 */
export interface ServiceRequest<T = unknown> {
  cmd: string;
  data: T;
}

/** 请求元信息(链路追踪 / 用户上下文透传) */
export interface RequestMeta {
  requestId: string;
  userId?: string;
  userRole?: string;
  /** 由上游注入,不信任下游自己设置 */
  [key: string]: unknown;
}

/** 微服务方法入参包装:业务数据 + 透传元信息 */
export interface ServiceCall<T = unknown> {
  data: T;
  meta: RequestMeta;
}

// 供 @Payload 使用的最小结构
export interface WrappedPayload<T> extends ServiceCall<T> {}

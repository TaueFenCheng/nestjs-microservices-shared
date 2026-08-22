import 'reflect-metadata';
import {
  getIdempotencyRegistry,
  setIdempotencyRegistry,
} from '../idempotency/idempotency.service';

export interface IdempotentOptions {
  /** 从方法参数提取幂等键;返回 undefined 表示"本次不幂等" */
  key: (...args: unknown[]) => string | undefined;
  /** 结果缓存时长,默认 86400s(1 天) */
  ttlSeconds?: number;
}

/**
 * 接口幂等注解 —— 对标 Java 常用 @Idempotent 注解(如 @IdempotentKey)。
 *
 * 用法:
 *   @Idempotent('order:create', { key: (dto) => dto.idempotencyKey })
 *   async create(dto: CreateOrderDto) { ... }
 *
 * 实现:复用 IdempotencyService(Redis SET NX EX),
 * 重放请求直接返回首次结果,副作用只发生一次。
 */
export function Idempotent(namespace: string, options: IdempotentOptions): MethodDecorator {
  return (_target, propertyKey, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (...args: unknown[]) => unknown;

    descriptor.value = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
      const idemKey = options.key(...args);
      if (!idemKey) {
        // 未提供幂等键:按普通请求处理
        return original.apply(this, args);
      }
      const service = getIdempotencyRegistry();
      if (!service) {
        // 未接 Redis(降级):直接执行
        return original.apply(this, args);
      }
      const { data } = await service.execute(
        `${namespace}:${idemKey}`,
        options.ttlSeconds ?? 86400,
        () => original.apply(this, args) as Promise<unknown>,
      );
      return data;
    };
  };
}

export { setIdempotencyRegistry };
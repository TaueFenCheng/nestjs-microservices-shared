import { CircuitBreakerOpenException, getCircuitBreakerRegistry } from './circuit-breaker.service';
import type { CircuitBreakerOptions } from './circuit-breaker.service';

/**
 * 熔断注解 —— 对标 Java 的 @CircuitBreaker(Resilience4j)/@HystrixCommand。
 *
 * 用法:
 *   @CircuitBreaker('payment-gateway', {
 *     failureThreshold: 5,
 *     recoveryTimeoutMs: 10_000,
 *     fallback: 'payFallback',     // 方法名(从 this 取)或函数
 *   })
 *   async callPaymentGateway(...) { ... }
 *
 * 实现说明:
 *  - 装饰器->方法替换,运行时从全局注册表取 CircuitBreakerService(由
 *    CircuitBreakerModule 在 onModuleInit 注册),避免装饰器拿不到 DI 实例;
 *  - 未注册时(极少见)原样执行,保证不阻塞启动。
 */
export function CircuitBreaker(name: string, options: CircuitBreakerOptions = {}): MethodDecorator {
  return (_target: object, _propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (...args: unknown[]) => unknown;

    descriptor.value = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
      const service = getCircuitBreakerRegistry();
      if (!service) {
        // 降级:直接执行
        return original.apply(this, args);
      }

      const fn = () => original.apply(this, args);
      try {
        return await service.execute(name, options, fn);
      } catch (err) {
        if (err instanceof CircuitBreakerOpenException) {
          const fallback = resolveFallback(options.fallback, this);
          if (fallback) {
            return fallback(err, ...args);
          }
        }
        throw err;
      }
    };
  };
}

/** fallback 支持"方法名字符串"(从 this 解析)或函数 */
function resolveFallback(
  fallback: CircuitBreakerOptions['fallback'],
  ctx: unknown,
): ((err: unknown, ...args: unknown[]) => unknown) | undefined {
  if (typeof fallback === 'string') {
    const fn = (ctx as Record<string, unknown>)?.[fallback];
    return typeof fn === 'function' ? (fn as (...a: unknown[]) => unknown).bind(ctx) : undefined;
  }
  if (typeof fallback === 'function') return fallback;
  return undefined;
}
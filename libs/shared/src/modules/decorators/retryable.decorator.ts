import { Logger } from '@nestjs/common';

const logger = new Logger('@Retryable');

export interface RetryableOptions {
  /** 最大尝试次数(含首次),默认 3 */
  maxAttempts?: number;
  /** 基础退避毫秒,按指数增长:backoff * 2^(attempt-1),默认 1000 */
  backoffMs?: number;
  /** 不计入重试的异常类型(业务失败直接抛) */
  exemptErrors?: Array<new (...args: never[]) => Error>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 重试注解 —— 对标 Spring Retry 的 @Retryable。
 *
 * 用法:
 *   @Retryable({ maxAttempts: 3, backoffMs: 200, exemptErrors: [BadRequestException] })
 *   async callThirdParty() { ... }
 *
 * 特性:
 *  - 指数退避(避免重试风暴);
 *  - exemptErrors 白名单:明确业务失败不重试(重试只会放大错误);
 *  - 重试耗尽后抛出最后一次异常。
 */
export function Retryable(options: RetryableOptions = {}): MethodDecorator {
  return (_target, propertyKey, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (...args: unknown[]) => unknown;
    const methodName = String(propertyKey);

    descriptor.value = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
      const maxAttempts = options.maxAttempts ?? 3;
      const exempt = options.exemptErrors ?? [];

      let lastErr: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await original.apply(this, args);
        } catch (err) {
          lastErr = err;
          if (attempt >= maxAttempts || exempt.some((t) => err instanceof t)) {
            throw err;
          }
          const delay = (options.backoffMs ?? 1000) * 2 ** (attempt - 1);
          logger.warn(
            `${methodName} 第 ${attempt}/${maxAttempts} 次失败,${delay}ms 后退避重试: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          await sleep(delay);
        }
      }
      throw lastErr;
    };
  };
}
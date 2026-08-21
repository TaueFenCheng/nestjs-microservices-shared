import { AsyncLocalStorage } from 'async_hooks';

/**
 * 请求上下文 —— 基于 AsyncLocalStorage 的上下文透传。
 *
 * 为什么需要:
 *  - 网关收到请求后生成 requestId,希望同一次调用链里所有日志都能带上;
 *  - 微服务之间转发时,把 requestId 放进 meta 透传,下游继续使用同一 id;
 *  - AsyncLocalStorage 在异步代码中自动传播,无需层层传参。
 */
export class RequestContext {
  private static readonly storage = new AsyncLocalStorage<{
    requestId: string;
    userId?: string;
    [key: string]: unknown;
  }>();

  static run<T>(context: { requestId: string; [key: string]: unknown }, fn: () => T): T {
    return this.storage.run(context, fn);
  }

  static getId(): string {
    return this.storage.getStore()?.requestId ?? 'no-request-id';
  }

  static get(key: string): unknown {
    return this.storage.getStore()?.[key];
  }

  static set(key: string, value: unknown): void {
    const store = this.storage.getStore();
    if (store) store[key] = value;
  }
}

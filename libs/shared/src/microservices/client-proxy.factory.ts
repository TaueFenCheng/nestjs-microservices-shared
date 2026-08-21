import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { RequestMeta } from '../interfaces/service-request.interface';

/**
 * 调用微服务的统一封装 —— 对业务代码隐藏 ClientProxy 细节。
 *
 * 高级特性演示:
 *  - firstValueFrom + timeout:把 RxJS 流转 Promise 并施加超时;
 *  - 统一超时、统一错误包装、统一透传 requestId(链路追踪)。
 *
 * 用法(注入某个微服务的 ClientProxy):
 *   constructor(@Inject(TOKENS.ORDERS_CLIENT) client: ClientProxy)
 *   const order = await this.clientFactory.call(client, MESSAGE_PATTERNS.ORDER_GET, { id });
 */
@Injectable()
export class ClientProxyFactoryService {
  constructor() {}

  /**
   * 发起请求-响应式调用(request/reply)。
   * @param client  目标服务代理
   * @param pattern 消息模式(来自共享常量表)
   * @param data    业务载荷
   * @param meta    链路元信息(requestId / userId),自动透传
   * @param timeoutMs 超时毫秒,默认 5000
   */
  async call<T = unknown, R = unknown>(
    client: ClientProxy,
    pattern: unknown,
    data: T,
    meta: RequestMeta = { requestId: 'no-request-id' },
    timeoutMs = 5000,
  ): Promise<R> {
    return firstValueFrom(
      client.send<unknown, { data: T; meta: RequestMeta }>(pattern, { data, meta }).pipe(
        timeout(timeoutMs),
      ),
    ) as Promise<R>;
  }

  /**
   * 发起事件式调用(发后即忘,future 异步处理)。
   * @param client  目标服务代理
   * @param pattern 事件模式
   * @param data    载荷
   */
  emit(client: ClientProxy, pattern: unknown, data: unknown): void {
    client.emit<unknown, unknown>(pattern, data).subscribe({
      error: (err) => {
        // 事件发送失败只记录,不阻塞主流程
        console.error(`[Clients] emit failed for ${String(pattern)}`, err);
      },
    });
  }
}

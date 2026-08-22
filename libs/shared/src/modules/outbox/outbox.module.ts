import { DynamicModule, Global, Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { TOKENS } from '../../constants/tokens';

export interface OutboxModuleOptions {
  /** 发布用客户端代理的 DI token(relay 用它 emit 事件);需为 Redis/Kafka 等广播型 transport */
  client: symbol | string;
  /** relay 轮询间隔毫秒,默认 3000 */
  relayIntervalMs?: number;
  /** 单条消息最大重试次数,超过进"死信"(默认 3) */
  maxRetries?: number;
}

/**
 * Outbox 模块 —— "先持久化,再可靠投递"的事件可靠层。
 *
 * 为什么要 Outbox:
 *  业务成功写入 DB 后直接 emit() 是"发后即忘":进程崩溃/网络抖动事件就丢了。
 *  Outbox 把事件先持久化到 Redis 队列(与业务同一次成功的前提),再由
 *  relay 周期投递,失败自动重试,彻底解决"本地事务与消息发布的一致性"。
 *
 * 用法:
 *   SharedModule.forRoot({
 *     reliability: {
 *       redis: {...},
 *       outbox: { client: TOKENS.ORDERS_CLIENT, relayIntervalMs: 3000 },
 *     },
 *   })
 *
 * 实现说明:client 选项以 DI token 形式经 OUTBOX_CLIENT 注入,
 * OutboxService 在 onModuleInit 时通过 ModuleRef(strict:false)从全局
 * 容器解析真正的 ClientProxy —— 避免与提供该 client 的模块产生强依赖。
 */
@Global()
@Module({})
export class OutboxModule {
  static forRoot(options: OutboxModuleOptions): DynamicModule {
    const providers = [
      OutboxService,
      // 注意:这里存的是"客户端 token",而非客户端实例
      { provide: TOKENS.OUTBOX_CLIENT, useValue: options.client },
      {
        provide: TOKENS.OUTBOX_RELAY_INTERVAL_MS,
        useValue: options.relayIntervalMs ?? 3000,
      },
    ];

    return {
      module: OutboxModule,
      global: true,
      providers,
      exports: [OutboxService],
    };
  }
}
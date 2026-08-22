import { DynamicModule, Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueService } from './queue.service';

export interface QueueModuleOptions {
  /** Redis 连接(BullMQ 自带连接管理,独立于 RedisModule 的 ioredis) */
  connection?: {
    host?: string;
    port?: number;
  };
}

/**
 * 任务队列模块 —— 基于 @nestjs/bullmq 的轻量封装。
 *
 * 用途(与 Redis pub/sub / Outbox 的区别):
 *  - Redis pub/sub:广播事件,没有持久化、时序、重试;
 *  - Outbox:保证"业务成功 -> 事件不丢"的一致性投递;
 *  - 本模块(BullMQ):真正的**任务队列** —— 延迟任务、定时任务、重试、死信。
 *
 * 用法:
 *   SharedModule.forRoot({ queue: { connection: { host, port } } })
 *   后,业务服务可:
 *   1. 注入 QueueService 调度任务(如"下单 30 分钟未支付自动取消");
 *   2. 用 @Processor(QUEUE_NAMES.ORDER_TIMEOUT) 消费任务。
 */
@Global()
@Module({})
export class QueueModule {
  static forRoot(options: QueueModuleOptions = {}): DynamicModule {
    return {
      module: QueueModule,
      global: true,
      imports: [
        BullModule.forRoot({
          connection: {
            host: options.connection?.host ?? 'localhost',
            port: options.connection?.port ?? 6379,
          },
        }),
      ],
      providers: [QueueService],
      exports: [BullModule, QueueService],
    };
  }

  /** 注册具体队列(在全局上下文,任意服务可 @InjectQueue) */
  static forFeature(queueNames: string[]): DynamicModule {
    return {
      module: QueueModule,
      global: true,
      imports: [BullModule.registerQueue(...queueNames.map((name) => ({ name })))],
      exports: [BullModule],
    };
  }
}
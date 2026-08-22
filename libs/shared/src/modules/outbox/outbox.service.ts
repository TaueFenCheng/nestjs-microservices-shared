import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ClientProxy } from '@nestjs/microservices';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { TOKENS } from '../../constants/tokens';

interface OutboxMessage<T = unknown> {
  id: string;
  topic: string;
  data: T;
  createdAt: string;
  retries: number;
}

/**
 * Outbox 服务 —— 可靠事件投递。
 *
 * 发布路径:
 *   业务代码.enqueue(topic, data)  -> LPUSH 持久化到 Redis list(只这一步落盘)
 *   relay 循环(定时):RPOP 取出 -> 用解析出来的 ClientProxy.emit 投递
 *     -> 成功即确认(消息已出队);失败重试计数+1 写回队尾,超限进"死信"。
 *
 * 对业务侧透明:业务只调用 enqueue,不关心何时投递、谁在投递。
 */
@Injectable()
export class OutboxService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxService.name);
  private timer?: ReturnType<typeof setInterval>;
  private publisher!: ClientProxy;
  private readonly OUTBOX_KEY = 'outbox:messages';

  constructor(
    private readonly moduleRef: ModuleRef,
    @Inject(TOKENS.REDIS_CLIENT) private readonly client: Redis,
    /** OUTBOX_CLIENT 注入的是"发布客户端的 DI token"(见 OutboxModule) */
    @Inject(TOKENS.OUTBOX_CLIENT) private readonly clientToken: symbol | string,
    @Optional()
    @Inject(TOKENS.OUTBOX_RELAY_INTERVAL_MS)
    private readonly relayIntervalMs: number = 3000,
    @Optional()
    @Inject('OUTBOX_MAX_RETRIES')
    private readonly maxRetries: number = 3,
  ) {}

  onModuleInit(): void {
    // 全局容器动态解析发布客户端(strict:false 允许跨模块)
    this.publisher = this.moduleRef.get<ClientProxy>(this.clientToken, { strict: false });

    const loop = async () => {
      try {
        await this.drain();
      } catch (err) {
        this.logger.warn(`outbox relay 异常: ${(err as Error).message}`);
      }
    };
    void loop(); // 立即先试一轮
    this.timer = setInterval(loop, this.relayIntervalMs);
    this.logger.log(`outbox relay 已启动,间隔 ${this.relayIntervalMs}ms`);
  }

  /** 业务调用:把事件写入 outbox(入队即代表"业务已成功") */
  async enqueue<T>(topic: string, data: T): Promise<string> {
    const message: OutboxMessage<T> = {
      id: randomUUID(),
      topic,
      data,
      createdAt: new Date().toISOString(),
      retries: 0,
    };
    await this.client.lpush(this.OUTBOX_KEY, JSON.stringify(message));
    this.logger.log(`outbox enqueue: ${topic} (${message.id})`);
    return message.id;
  }

  /** 一轮投递:从队尾取消息直到队列空 */
  private async drain(): Promise<void> {
    let raw: string | null;
    while ((raw = await this.client.rpop(this.OUTBOX_KEY))) {
      const msg = JSON.parse(raw) as OutboxMessage;
      try {
        // ClientProxy.emit 返回 Observable:订阅即发送,complete 即确认
        await firstValueFrom(this.publisher.emit(msg.topic, msg.data));
        this.logger.log(`outbox relay OK: ${msg.topic} (${msg.id})`);
      } catch (err) {
        const next = { ...msg, retries: msg.retries + 1 };
        if (next.retries <= this.maxRetries) {
          this.logger.warn(`outbox relay 失败(${next.retries}/${this.maxRetries}),回写重试: ${msg.topic}`);
          await this.client.rpush(this.OUTBOX_KEY, JSON.stringify(next));
        } else {
          // 重试耗尽:生产环境应推入独立死信队列供人工处理
          this.logger.error(
            `outbox 消息进入死信(丢弃): ${msg.topic} (${msg.id}), error=${(err as Error).message}`,
          );
        }
      }
    }
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
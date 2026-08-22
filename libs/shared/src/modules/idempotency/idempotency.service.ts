import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { TOKENS } from '../../constants/tokens';

export interface IdempotencyResult<T> {
  /** 业务结果(fn 的返回值,或缓存的历史结果) */
  data: T;
  /** true = 本次是重放请求,fn 未再次执行 */
  replayed: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- 注册表:@Idempotent 装饰器运行时取实例 ----------
let idempotencyRegistry: IdempotencyService | null = null;
export function setIdempotencyRegistry(instance: IdempotencyService | null): void {
  idempotencyRegistry = instance;
}
export function getIdempotencyRegistry(): IdempotencyService | null {
  return idempotencyRegistry;
}

/**
 * 幂等服务 —— 基于 Redis SET NX EX 的"去重 + 结果缓存"。
 *
 * 原理:
 *  1. 首次请求:SET key 'pending' NX EX ttl 成功 => 执行 fn;
 *  2. 执行成功后把结果 JSON 序列化回写同 key;
 *  3. 重放请求:NX 失败 => 读到缓存结果直接返回,fn 不再执行。
 *
 * 典型场景:
 *  - 下单防重:同一 idempotencyKey 只创建一单;
 *  - 支付防重:同一 orderId 只扣一次款(重复的 PAYMENT_CREATE 返回同一 payment)。
 *
 * 注意(教学简化):并发首次请求存在极小概率双执行(fn 不幂等时生产应配合
 * 分布式锁或数据库唯一约束);fn 抛错时会清除占位,允许后续重试。
 */
@Injectable()
export class IdempotencyService implements OnModuleInit {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(@Inject(TOKENS.REDIS_CLIENT) private readonly client: Redis) {}

  onModuleInit(): void {
    setIdempotencyRegistry(this);
  }

  /**
   * 幂等执行。
   * @param key        幂等键,如 `order:create:${idempotencyKey}`
   * @param ttlSeconds 结果缓存时长
   * @param fn         真正的业务函数(仅首次执行)
   */
  async execute<T>(key: string, ttlSeconds: number, fn: () => Promise<T> | T): Promise<IdempotencyResult<T>> {
    const redisKey = `idem:${key}`;

    // 1. 尝试占位(原子):只有 key 不存在时才会成功
    const acquired = await this.client.set(redisKey, 'pending', 'EX', ttlSeconds, 'NX');

    if (acquired === 'OK') {
      // 首次请求:执行并缓存结果
      try {
        const data: T = await fn();
        await this.client.set(redisKey, JSON.stringify(data), 'EX', ttlSeconds).catch(() => undefined);
        return { data, replayed: false };
      } catch (err) {
        // 失败不占位:删除,允许重试
        await this.client.del(redisKey).catch(() => undefined);
        throw err;
      }
    }

    // 2. 重放或并发:读缓存结果
    const cached = await this.client.get(redisKey);
    if (cached && cached !== 'pending') {
      return { data: JSON.parse(cached) as T, replayed: true };
    }

    // 3. 仍处于 'pending'(首次请求正在执行):短暂等待后重读一次
    await sleep(50);
    const second = await this.client.get(redisKey);
    if (second && second !== 'pending') {
      return { data: JSON.parse(second) as T, replayed: true };
    }

    // 4. 极端竞态(占位已过期/首次执行异常):兜底直接执行
    this.logger.warn(`幂等键 ${key} 占位异常,兜底重新执行`);
    const data: T = await fn();
    await this.client
      .set(redisKey, JSON.stringify(data), 'EX', ttlSeconds)
      .catch(() => undefined);
    return { data, replayed: false };
  }
}
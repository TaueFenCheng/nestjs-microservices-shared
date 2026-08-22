import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { TOKENS } from '../../constants/tokens';

/**
 * 分布式锁 —— 基于 Redis SET NX PX(带自动过期)+ Lua 原子释放。
 *
 * 关键点:
 *  - 随机 owner 值:释放时用 Lua 比对,防止"A 的锁被 B 释放"(经典误删问题);
 *  - TTL 自动过期:即使持有者崩溃,锁也会在 ttlMs 后自动释放(防死锁);
 *  - 拿不到锁抛 ConflictException => 网关 409,语义是"请勿重复提交"。
 */
@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);

  constructor(@Inject(TOKENS.REDIS_CLIENT) private readonly client: Redis) {}

  /** 释放锁的 Lua 脚本:值匹配才删除(原子操作) */
  private static readonly RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

  /** 尝试获取锁,成功后持有到 ttlMs 过期 */
  async acquire(key: string, ttlMs: number): Promise<{ owner: string } | null> {
    const owner = randomUUID();
    const ok = await this.client.set(`lock:${key}`, owner, 'PX', ttlMs, 'NX');
    return ok === 'OK' ? { owner } : null;
  }

  /** 释放锁(仅当 owner 匹配,避免误删他人锁) */
  async release(key: string, owner: string): Promise<void> {
    await this.client.eval(DistributedLockService.RELEASE_SCRIPT, 1, `lock:${key}`, owner);
  }

  /**
   * 便捷方法:抢锁 -> 执行 fn -> 释放锁。
   * 拿不到锁抛 409 Conflict(操作正在处理中)。
   */
  async runWithLock<T>(key: string, ttlMs: number, fn: () => Promise<T> | T): Promise<T> {
    const lock = await this.acquire(key, ttlMs);
    if (!lock) {
      this.logger.warn(`分布式锁已被占用: ${key}`);
      throw new ConflictException(`操作正在处理中,请勿重复提交(${key})`);
    }
    try {
      return await fn();
    } finally {
      await this.release(key, lock.owner).catch((err) =>
        this.logger.warn(`释放锁失败: ${key} ${(err as Error).message}`),
      );
    }
  }
}
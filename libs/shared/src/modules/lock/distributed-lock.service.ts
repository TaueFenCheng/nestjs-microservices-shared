import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { TOKENS } from '../../constants/tokens';

/** 锁句柄:持有锁期间由看门狗定时续期,stop() 停止续期 */
export interface LockHandle {
  key: string;
  owner: string;
  /** 手动续期一次(看门狗内部使用) */
  renew(): Promise<void>;
  /** 停止看门狗续期(释放锁前调用) */
  stop(): void;
}

/**
 * 分布式锁 —— 基于 Redis SET NX PX(带自动过期)+ Lua 原子释放/续期。
 *
 * 关键点:
 *  - 随机 owner 值:释放时用 Lua 比对,防止"A 的锁被 B 释放"(经典误删问题);
 *  - TTL 自动过期:持有者崩溃时锁自动释放(防死锁);
 *  - 看门狗(Watchdog)续期:持有期间每 ttl/3 续期一次,防止临界区执行
 *    超过 TTL 导致锁提前过期、临界区失效;
 *  - 续期同样"值匹配才续":绝不给已被别人持有的锁续期。
 */
@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);

  constructor(@Inject(TOKENS.REDIS_CLIENT) private readonly client: Redis) {}

  /** 释放锁:值匹配才删除(原子) */
  private static readonly RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

  /** 续期:仅当仍是自己的锁时才 PEXPIRE,否则不动(防止给别人续期) */
  private static readonly RENEW_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end`;

  private static lockKey(key: string): string {
    return `lock:${key}`;
  }

  /**
   * 获取锁(带看门狗)。
   * @param ttlMs  锁的初始租约时长
   * @param renew  是否开启看门狗续期(默认 true)
   * @returns 句柄;拿不到锁返回 null
   */
  async acquire(key: string, ttlMs: number, renew = true): Promise<LockHandle | null> {
    const owner = randomUUID();
    const redisKey = DistributedLockService.lockKey(key);
    const ok = await this.client.set(redisKey, owner, 'PX', ttlMs, 'NX');
    if (ok !== 'OK') return null;

    // 看门狗:周期续期,直到 stop()
    let timer: ReturnType<typeof setInterval> | undefined;
    if (renew) {
      const interval = Math.max(1_000, Math.floor(ttlMs / 3));
      timer = setInterval(() => {
        this.renew(redisKey, owner, ttlMs).catch((err) =>
          this.logger.warn(`看门狗续期异常: ${key} ${(err as Error).message}`),
        );
      }, interval);
      // 不阻塞进程退出
      timer.unref?.();
    }

    return {
      key,
      owner,
      renew: () => this.renew(redisKey, owner, ttlMs),
      stop: () => {
        if (timer) clearInterval(timer);
      },
    };
  }

  /** 释放锁(仅当 owner 匹配,避免误删他人锁) */
  async release(key: string, owner: string): Promise<void> {
    await this.client.eval(
      DistributedLockService.RELEASE_SCRIPT,
      1,
      DistributedLockService.lockKey(key),
      owner,
    );
  }

  /**
   * 便捷方法:抢锁(带看门狗)-> 执行 fn -> 停止续期 + 释放锁。
   * 拿不到锁抛 409 Conflict(操作正在处理中)。
   */
  async runWithLock<T>(key: string, ttlMs: number, fn: () => Promise<T> | T): Promise<T> {
    const handle = await this.acquire(key, ttlMs);
    if (!handle) {
      this.logger.warn(`分布式锁已被占用: ${key}`);
      throw new ConflictException(`操作正在处理中,请勿重复提交(${key})`);
    }
    try {
      return await fn();
    } finally {
      // 停止看门狗,再释放(顺序不能反:先停续期,否则续期可能把锁续给已删除的 key)
      handle.stop();
      await this.release(key, handle.owner).catch((err) =>
        this.logger.warn(`释放锁失败: ${key} ${(err as Error).message}`),
      );
    }
  }

  /** 内部:值匹配才续期 */
  private async renew(redisKey: string, owner: string, ttlMs: number): Promise<void> {
    await this.client.eval(
      DistributedLockService.RENEW_SCRIPT,
      1,
      redisKey,
      owner,
      String(ttlMs),
    );
  }
}
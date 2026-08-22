import { Logger } from '@nestjs/common';

const logger = new Logger('@Cacheable');

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/** 进程内缓存 store(TTL 过期;生产可换 Redis,见注释) */
const store = new Map<string, CacheEntry>();

export interface CacheableOptions {
  /** 缓存 TTL 毫秒,默认 60_000 */
  ttlMs?: number;
  /** 自定义缓存键(如按 userId/key 分区);默认 JSON 序列化全部参数 */
  keyFn?: (...args: unknown[]) => string;
}

/**
 * 缓存注解 —— 对标 Spring Cache 的 @Cacheable。
 *
 * 用法:
 *   @Cacheable('orders:list', { ttlMs: 30_000 })
 *   async findAll() { ... }        // 命中直接返回,不执行 DB
 *
 * 特性:
 *  - 进程内 TTL 缓存(单实例教学;生产可替换为 @nestjs/cache-manager + Redis,
 *    并配合 @CacheEvict 在写路径失效,防缓存穿透/击穿已有分布式锁);
 *  - undefined 不缓存(避免掩盖真实结果);
 *  - 附带 HIT/MISS 日志,便于观察缓存行为。
 */
export function Cacheable(namespace: string, options: CacheableOptions = {}): MethodDecorator {
  return (_target, propertyKey, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (...args: unknown[]) => unknown;
    const methodName = String(propertyKey);

    descriptor.value = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
      const cacheKey = `${namespace}:${options.keyFn ? options.keyFn(...args) : args.length ? JSON.stringify(args) : 'default'}`;
      const hit = store.get(cacheKey);
      if (hit && hit.expiresAt > Date.now()) {
        logger.log(`CACHE HIT ${cacheKey} (${methodName})`);
        return hit.value;
      }

      logger.log(`CACHE MISS ${cacheKey} (${methodName})`);
      const result = await original.apply(this, args);
      if (result !== undefined) {
        store.set(cacheKey, { value: result, expiresAt: Date.now() + (options.ttlMs ?? 60_000) });
      }
      return result;
    };
  };
}

/** 手动失效(写路径调用,防脏读) */
export function evictCache(namespace: string): void {
  const prefix = `${namespace}:`;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
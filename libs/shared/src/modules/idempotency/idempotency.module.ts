import { Global, Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';

/**
 * 幂等模块 —— 防重复提交 / 防重复扣款。
 *
 * 依赖 RedisModule 提供的 TOKENS.REDIS_CLIENT。
 * 用法(在任意服务中):
 *   const { data, replayed } = await idempotency.execute('order:create:abc', 86400, () => repo.save(order));
 *   - 首次调用:执行 fn,结果缓存 TTL 秒;
 *   - 重放调用:直接返回缓存结果,fn 不会再次执行 —— 副作用只发生一次。
 */
@Global()
@Module({
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
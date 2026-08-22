import { Global, Module } from '@nestjs/common';
import { DistributedLockService } from './distributed-lock.service';

/**
 * 分布式锁模块 —— 跨进程互斥(防并发支付、防并发取消)。
 *
 * 依赖 RedisModule。用法:
 *   await lockService.runWithLock('payment:lock:order-1', 10_000, async () => {
 *     // 临界区:同一时间只有一个实例能进来
 *   });
 */
@Global()
@Module({
  providers: [DistributedLockService],
  exports: [DistributedLockService],
})
export class LockModule {}
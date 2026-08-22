import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { QUEUE_JOB_NAMES, QUEUE_NAMES } from '../../constants/queue-names';

/**
 * 队列服务 —— 封装常用调度操作的"便捷门面"。
 * 业务代码不直接接触 bullmq 的 Queue,只调用语义化方法。
 */
@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.ORDER_TIMEOUT) private readonly orderTimeoutQueue: Queue,
  ) {}

  /**
   * 调度"订单超时自动取消"延迟任务。
   * @param orderId 订单 ID
   * @param delayMs 延迟毫秒(如 30 分钟 = 30 * 60 * 1000)
   */
  async scheduleOrderAutoCancel(orderId: string, delayMs: number): Promise<Job | undefined> {
    const job = await this.orderTimeoutQueue.add(
      QUEUE_JOB_NAMES.ORDER_AUTO_CANCEL,
      { orderId },
      {
        delay: delayMs,
        attempts: 1,
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
    this.logger.log(`已调度订单超时任务: ${orderId},延迟 ${delayMs}ms`);
    return job;
  }
}
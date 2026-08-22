import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { OrderStatus, QUEUE_JOB_NAMES, QUEUE_NAMES } from '@app/shared';
import { OrdersService } from './orders.service';

/**
 * 订单超时队列消费者 —— BullMQ Worker 示例。
 *
 * 场景:下单后 N 分钟未支付,自动取消订单(经典电商防"僵尸订单")。
 * 语义:
 *  - 队列延迟投递(创建订单时用 queue.add(..., { delay }) 调度);
 *  - 到点消费时**再次校验状态**:只取消仍处于 PENDING 的订单,
 *    已支付/已取消的不动 —— 幂等消费,状态机说了算。
 */
@Processor(QUEUE_NAMES.ORDER_TIMEOUT)
export class OrderTimeoutProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderTimeoutProcessor.name);

  constructor(private readonly ordersService: OrdersService) {
    super();
  }

  async process(job: Job<{ orderId: string }>): Promise<void> {
    const { orderId } = job.data;
    const order = this.ordersService.findById(orderId);
    if (!order) {
      this.logger.warn(`超时任务:订单不存在,忽略 ${orderId}`);
      return;
    }
    if (order.status !== OrderStatus.PENDING) {
      this.logger.log(`超时任务:订单 ${orderId} 已变为 ${order.status},跳过`);
      return;
    }

    this.ordersService.updateStatus(orderId, OrderStatus.CANCELLED);
    this.logger.log(`订单超时未支付,自动取消: ${orderId}`);
  }
}
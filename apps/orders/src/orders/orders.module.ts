import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderTimeoutProcessor } from './order-timeout.processor';

/**
 * 订单业务模块 —— 只关心订单领域,不关心日志/鉴权/数据库怎么连。
 * 额外注册 BullMQ Worker(OrderTimeoutProcessor):消费超时自动取消任务。
 */
@Module({
  controllers: [OrdersController],
  providers: [OrdersService, OrderTimeoutProcessor],
  exports: [OrdersService],
})
export class OrdersModule {}

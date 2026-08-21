import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

/**
 * 订单业务模块 —— 只关心订单领域,不关心日志/鉴权/数据库怎么连。
 */
@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}

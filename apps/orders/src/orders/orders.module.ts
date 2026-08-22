import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderTimeoutProcessor } from './order-timeout.processor';
import { OrderEntity } from '../entities/order.entity';

/**
 * 订单业务模块 —— 注册实体仓储(TypeORM forFeature)。
 * 额外注册 BullMQ Worker(OrderTimeoutProcessor)。
 */
@Module({
  controllers: [OrdersController],
  imports: [TypeOrmModule.forFeature([OrderEntity])],
  providers: [OrdersService, OrderTimeoutProcessor],
  exports: [OrdersService],
})
export class OrdersModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderTimeoutProcessor } from './order-timeout.processor';
import { OrderEntity } from '../entities/order.entity';

/**
 * 订单业务模块 —— 注册实体仓储(TypeORM forFeature)。
 * 额外注册 BullMQ Worker(OrderTimeoutProcessor)与定时任务(ScheduleModule)。
 */
@Module({
  controllers: [OrdersController],
  imports: [
    TypeOrmModule.forFeature([OrderEntity]), // 主库(master)
    TypeOrmModule.forFeature([OrderEntity], 'slave'), // 只读副本(slave)
    ScheduleModule.forRoot(), // @nestjs/schedule 定时任务
  ],
  providers: [OrdersService, OrderTimeoutProcessor],
  exports: [OrdersService],
})
export class OrdersModule {}

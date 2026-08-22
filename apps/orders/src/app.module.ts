import { Module } from '@nestjs/common';
import { SharedModule } from '@app/shared';
import { OrdersModule } from './orders/orders.module';

/**
 * orders 微服务根模块。
 * 开启 reliability:Redis 底座 + 幂等(下单防重)+ 分布式锁。
 */
@Module({
  imports: [
    SharedModule.forRoot({
      appName: 'orders',
      database: { type: 'memory' }, // 示例用内存;生产接真实数据库
      auth: { secret: process.env.JWT_SECRET ?? 'change-me' },
      reliability: {
        redis: {
          host: process.env.REDIS_HOST ?? 'localhost',
          port: Number(process.env.REDIS_PORT ?? 6379),
        },
      },
      // 任务队列:BullMQ(下单超时自动取消)
      queue: {
        connection: {
          host: process.env.REDIS_HOST ?? 'localhost',
          port: Number(process.env.REDIS_PORT ?? 6379),
        },
      },
    }),
    OrdersModule,
  ],
})
export class AppModule {}

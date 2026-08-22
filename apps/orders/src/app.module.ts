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
      // 真实数据库:TypeORM + PostgreSQL(接库演示,含 migration)
      database: {
        type: 'postgres',
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 5432),
        user: process.env.DB_USER ?? 'postgres',
        password: process.env.DB_PASSWORD ?? 'postgres',
        database: process.env.DB_NAME ?? 'nestjs_microservices',
        // 读写分离:读查询走命名副本(生产环境为独立只读实例,此处同库演示)
        replicas: [
          {
            name: 'slave',
            host: process.env.DB_SLAVE_HOST ?? process.env.DB_HOST ?? 'localhost',
            port: Number(process.env.DB_PORT ?? 5432),
            user: process.env.DB_USER ?? 'postgres',
            password: process.env.DB_PASSWORD ?? 'postgres',
            database: process.env.DB_NAME ?? 'nestjs_microservices',
          },
        ],
      },
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

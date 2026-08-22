import { Module } from '@nestjs/common';
import { SharedModule } from '@app/shared';
import { BillingModule } from './billing/billing.module';

/**
 * billing 微服务根模块。
 * 开启 reliability:幂等(防重复扣款)+ 分布式锁 + Redis 事件接收。
 */
@Module({
  imports: [
    SharedModule.forRoot({
      appName: 'billing',
      database: { type: 'memory' },
      auth: { secret: process.env.JWT_SECRET ?? 'change-me' },
      reliability: {
        redis: {
          host: process.env.REDIS_HOST ?? 'localhost',
          port: Number(process.env.REDIS_PORT ?? 6379),
        },
      },
    }),
    BillingModule,
  ],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { SharedModule } from '@app/shared';
import { BillingModule } from './billing/billing.module';

/**
 * billing 微服务根模块。
 * 同样一行接入共享库。
 */
@Module({
  imports: [
    SharedModule.forRoot({
      appName: 'billing',
      database: { type: 'memory' },
      auth: { secret: process.env.JWT_SECRET ?? 'change-me' },
    }),
    BillingModule,
  ],
})
export class AppModule {}

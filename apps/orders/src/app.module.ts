import { Module } from '@nestjs/common';
import { SharedModule } from '@app/shared';
import { OrdersModule } from './orders/orders.module';

/**
 * orders 微服务根模块。
 * 同样只有几行:共享库一行接入日志/健康检查/数据库,业务模块自己注册。
 */
@Module({
  imports: [
    SharedModule.forRoot({
      appName: 'orders',
      database: { type: 'memory' }, // 示例用内存;生产接真实数据库
      auth: { secret: process.env.JWT_SECRET ?? 'change-me' },
    }),
    OrdersModule,
  ],
})
export class AppModule {}

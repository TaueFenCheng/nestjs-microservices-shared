import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import {
  ClientsModule,
  ClientProxyFactoryService,
  JwtAuthGuard,
  RolesGuard,
  SharedModule,
  TOKENS,
} from '@app/shared';
import { Transport } from '@nestjs/microservices';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PaymentSagaService } from './saga/payment-saga.service';
import configuration from './config/configuration';

/**
 * 网关根模块 —— 演示"公共模块抽离后,接入方代码有多薄"。
 *
 * 对比:没有共享库时,网关需要自己注册日志、鉴权、数据库、
 *      客户端代理、拦截器、过滤器……约 200 行样板;
 *      有了共享库,下面 40 行搞定。
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    // 一行接入所有公共能力(日志 + 健康检查;按需加 database/auth)
    SharedModule.forRoot({
      appName: 'api-gateway',
      database: null,
      auth: { secret: process.env.JWT_SECRET ?? 'change-me', expiresIn: '1h' },
      // 可靠性:Redis + 幂等 + 分布式锁 + Outbox(事件先持久化再由 relay 投递)
      reliability: {
        redis: {
          host: process.env.REDIS_HOST ?? 'localhost',
          port: Number(process.env.REDIS_PORT ?? 6379),
        },
        outbox: {
          // relay 用 orders 的 Redis 客户端广播事件(orders/billing 都能收到)
          client: TOKENS.ORDERS_CLIENT,
          relayIntervalMs: 3000,
        },
      },
    }),
    // 微服务客户端:orders(Redis) + billing(TCP)
    ClientsModule.forFeature([
      {
        provide: TOKENS.ORDERS_CLIENT,
        options: {
          transport: Transport.REDIS,
          host: process.env.REDIS_HOST ?? 'localhost',
          port: Number(process.env.REDIS_PORT ?? 6379),
        },
      },
      {
        provide: TOKENS.BILLING_CLIENT,
        options: {
          transport: Transport.TCP,
          host: 'localhost',
          port: Number(process.env.BILLING_TCP_PORT ?? 4001),
        },
      },
    ]),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    ClientProxyFactoryService,
    PaymentSagaService,
    // 全局守卫:先 JWT 鉴权,再角色授权
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

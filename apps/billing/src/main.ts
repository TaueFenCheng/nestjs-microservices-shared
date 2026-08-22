import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * billing 微服务 —— 混合应用(Hybrid)。
 * 同时监听两个传输:
 *  - TCP:网关的 RPC 调用(PAYMENT_CREATE / CONFIRM / REFUND);
 *  - Redis:接收事件(如订单创建事件),演示"事件驱动 + 多传输"。
 *
 * 这是比 orders 更进一步的演示:同一个应用,多传输并存。
 */
async function bootstrap() {
  const logger = new Logger('BillingService');
  const port = Number(process.env.BILLING_TCP_PORT ?? 4001);

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // TCP:请求-响应(RPC)
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: { host: '0.0.0.0', port },
  });

  // Redis:事件订阅(广播)
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.REDIS,
    options: {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
    },
  });

  // 显式触发应用初始化生命周期(onModuleInit/onApplicationBootstrap)。
  // 注意:混合应用只调 startAllMicroservices() 时 Nest 不会自动走完整
  // init() 流程,依赖这些钩子的模块(Redis 连接、熔断注册表、BullMQ worker)会失效。
  await app.init();

  await app.startAllMicroservices();
  logger.log(`billing 微服务已启动,监听 TCP :${port} + Redis 事件`);
}

bootstrap();
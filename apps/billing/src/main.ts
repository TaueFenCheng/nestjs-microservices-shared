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

  await app.startAllMicroservices();
  logger.log(`billing 微服务已启动,监听 TCP :${port} + Redis 事件`);
}

bootstrap();
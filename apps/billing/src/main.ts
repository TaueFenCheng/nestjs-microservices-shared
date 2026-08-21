import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * billing 微服务 —— TCP transport。
 * 与 orders 对比:同一个共享库,不同的传输层。
 * 演示"公共模块抽离后,传输层可独立演进"。
 */
async function bootstrap() {
  const logger = new Logger('BillingService');
  const port = Number(process.env.BILLING_TCP_PORT ?? 4001);

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.TCP,
    options: { host: '0.0.0.0', port },
  });

  await app.listen();
  logger.log(`billing 微服务已启动,监听 TCP :${port}`);
}

bootstrap();

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * orders 微服务 —— Redis transport。
 * 通过 Redis pub/sub 与网关及其他服务通信。
 *
 * 传输层选择说明:
 *  - Redis:易用、轻量,适合消息量中等的场景;
 *  - 如需持久化/重放,换成 Kafka;如需强类型契约,换成 gRPC。
 */
async function bootstrap() {
  const logger = new Logger('OrdersService');

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.REDIS,
    options: {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
    },
  });

  await app.listen();
  logger.log('orders 微服务已启动,监听 Redis (localhost:6379)');
}

bootstrap();

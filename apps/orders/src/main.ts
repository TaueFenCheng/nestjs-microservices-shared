import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';
import { QUEUE_NAMES } from '@app/shared';
import { AppModule } from './app.module';

/**
 * orders 微服务 —— 混合应用(Hybrid)。
 * 同时监听两个传输:
 *  - Redis:请求-响应(RPC)+ 广播事件(与网关/计费互通);
 *  - RabbitMQ:点对点队列订单事件,手动 ack(演示 ack 语义与 Redis 广播对比)。
 *
 * 传输层对比:
 *  - Redis pub/sub:广播,消息不持久化,无消费确认;
 *  - RabbitMQ 队列:点对点,一条消息只被消费一次,支持手动 ack/requeue/死信。
 */
async function bootstrap() {
  const logger = new Logger('OrdersService');

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Redis:请求-响应 + 事件广播
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.REDIS,
    options: {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
    },
  });

  // RabbitMQ:点对点队列(noAck: false => 手动确认)
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL ?? 'amqp://localhost:5672'],
      queue: QUEUE_NAMES.ORDER_EVENTS_RMQ,
      queueOptions: { durable: true },
      noAck: false, // 关闭自动确认,演示手动 ack / nack(requeue)
    },
  });

  // 显式触发应用初始化生命周期(onModuleInit/onApplicationBootstrap)。
  // 混合应用只调 startAllMicroservices() 时 Nest 不会自动走完整 init(),
  // Redis 连接、BullMQ worker 等依赖这些钩子的能力会失效。
  await app.init();

  await app.startAllMicroservices();
  logger.log(`orders 微服务已启动,监听 Redis + RabbitMQ(${QUEUE_NAMES.ORDER_EVENTS_RMQ})`);
}

bootstrap();
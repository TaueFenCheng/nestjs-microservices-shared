import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { SharedValidationPipe } from '@app/shared';
import { AllExceptionsFilter } from '@app/shared';
import { LoggingInterceptor } from '@app/shared';
import { RequestIdInterceptor } from '@app/shared';
import { TransformInterceptor } from '@app/shared';
import { Logger } from '@nestjs/common';

/**
 * API 网关 —— 混合应用(Hybrid Application)。
 *
 * 一个进程同时做两件事:
 *  1. HTTP 服务:对外暴露 REST API;
 *  2. Redis 传输微服务:监听 ORDER_STATUS_CHANGED 等事件(可选)。
 *
 * 同时注册全局管道/过滤器/拦截器(全部来自共享库)。
 */
async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // ---- 全局横切配置(全部来自 @app/shared) ----
  app.useGlobalPipes(new SharedValidationPipe(), new ValidationPipe({ transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(
    new RequestIdInterceptor(),
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  // ---- 可选:网关也作为消费者监听事件 ----
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.REDIS,
    options: { host: process.env.REDIS_HOST ?? 'localhost', port: Number(process.env.REDIS_PORT ?? 6379) },
  });

  await app.startAllMicroservices();
  await app.listen(3000);

  logger.log('API Gateway 已启动: http://localhost:3000');
  logger.log('微服务监听: Redis (localhost:6379)');
}

bootstrap();

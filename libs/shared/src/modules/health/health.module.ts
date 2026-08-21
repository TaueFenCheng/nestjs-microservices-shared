import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

/**
 * 健康检查模块 —— 基于 @nestjs/terminus。
 * 每个微服务都暴露 /health 探活端点,供服务注册中心 / K8s livenessProbe 使用。
 * 可扩展:DatabaseHealthIndicator、RedisHealthIndicator 等指示器。
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}

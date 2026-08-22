import { Global, Module } from '@nestjs/common';
import { CircuitBreakerService } from './circuit-breaker.service';

/**
 * 熔断器模块 —— 服务降级的"最后一公里"。
 * @Global 且不依赖 Redis(内存状态机),任意服务可直接使用 @CircuitBreaker。
 */
@Global()
@Module({
  providers: [CircuitBreakerService],
  exports: [CircuitBreakerService],
})
export class CircuitBreakerModule {}
import { Controller, Get, Inject, Optional } from '@nestjs/common';
import { HealthCheck, HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus';
import { DatabaseService } from '../database/database.service';
import { Public } from '../auth/public.decorator';

/**
 * 健康检查控制器。
 * 微服务与网关共用:GET /health 返回服务存活 + 依赖健康状态。
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    @Optional()
    @Inject(DatabaseService) private readonly db?: DatabaseService,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  check() {
    const db = this.db;
    return this.health.check([
      () => this.memory.checkHeap('memory_heap', 200 * 1024 * 1024),
      // 未接入真实数据库时跳过该指示器
      ...(db
        ? [() => db.ping().then(() => ({ database: { status: 'up' as const } }))]
        : []),
    ]);
  }
}

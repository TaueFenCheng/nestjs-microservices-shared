import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

/** 熔断器状态 */
export type CircuitStateName = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitState {
  state: CircuitStateName;
  /** 连续失败计数(仅 CLOSED/HALF_OPEN 阶段累计) */
  failures: number;
  /** 进入 OPEN 的时刻(用于计算冷却期) */
  openedAt?: number;
}

export interface CircuitBreakerOptions {
  /** 连续失败多少次触发熔断(默认 5) */
  failureThreshold?: number;
  /** 熔断冷却时长,到期进入半开试探(默认 10s) */
  recoveryTimeoutMs?: number;
  /** 快速失败/调用异常时的兜底:函数,或方法名(从 this 取) */
  fallback?: string | ((err: unknown, ...args: unknown[]) => unknown);
  /** 不计入失败计数的异常类型列表(如业务校验异常) */
  exemptErrors?: Array<new (...args: never[]) => Error>;
}

/** 熔断已打开时抛出的快速失败异常(不再调用真实业务) */
export class CircuitBreakerOpenException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenException';
  }
}

// ---------- 注册表:装饰器在运行时懒取 service 实例 ----------
let registry: CircuitBreakerService | null = null;
export function setCircuitBreakerRegistry(instance: CircuitBreakerService | null): void {
  registry = instance;
}
export function getCircuitBreakerRegistry(): CircuitBreakerService | null {
  return registry;
}

/**
 * 熔断器服务 —— 内存状态机(CLOSED -> OPEN -> HALF_OPEN)。
 *
 * 语义(对标 Java 的 Resilience4j / Hystrix):
 *  - CLOSED:正常调用,连续失败达 failureThreshold 次 -> OPEN;
 *  - OPEN:快速失败(抛 CircuitBreakerOpenException),不再调用真实业务,
 *    让下游"喘口气",避免故障传播(雪崩保护);
 *  - 冷却 recoveryTimeoutMs 后自动 -> HALF_OPEN:放行试探请求,
 *    成功 -> CLOSED(恢复),失败 -> 回到 OPEN。
 *
 * 教学简化:状态存进程内存。生产环境多实例部署时,状态应放 Redis 共享
 * (把本类状态机换成 Redis hash + Lua CAS),本仓库已有 Redis 底座可直接演进。
 */
@Injectable()
export class CircuitBreakerService implements OnModuleInit {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly circuits = new Map<string, CircuitState>();

  onModuleInit(): void {
    setCircuitBreakerRegistry(this);
    this.logger.log('熔断器注册表就绪');
  }

  /** 熔断执行:按 name 独立统计,互不影响 */
  async execute<T>(name: string, options: CircuitBreakerOptions, fn: () => Promise<T> | T): Promise<T> {
    const opts = this.normalize(options);
    const st = this.getState(name);

    // OPEN:冷却期未到 -> 快速失败;冷却期到 -> 转 HALF_OPEN 放行试探
    if (st.state === 'OPEN') {
      if (Date.now() - (st.openedAt ?? 0) < opts.recoveryTimeoutMs) {
        throw new CircuitBreakerOpenException(`熔断器已打开,快速失败: ${name}`);
      }
      st.state = 'HALF_OPEN';
      this.logger.log(`熔断器 ${name}: OPEN -> HALF_OPEN(放行试探)`);
    }

    try {
      const result = await fn();
      if (st.state === 'HALF_OPEN') {
        st.state = 'CLOSED';
        st.failures = 0;
        this.logger.log(`熔断器 ${name}: HALF_OPEN -> CLOSED(探测成功,恢复)`);
      }
      return result;
    } catch (err) {
      const exempt = (options.exemptErrors ?? []).some((t) => err instanceof t);
      if (exempt) throw err;

      st.failures += 1;
      if (st.state === 'HALF_OPEN') {
        st.state = 'OPEN';
        st.openedAt = Date.now();
        st.failures = 1;
        this.logger.warn(`熔断器 ${name}: HALF_OPEN -> OPEN(试探失败,回到熔断)`);
      } else if (st.state === 'CLOSED' && st.failures >= opts.failureThreshold) {
        st.state = 'OPEN';
        st.openedAt = Date.now();
        this.logger.warn(
          `熔断器 ${name}: CLOSED -> OPEN(连续失败 ${st.failures} 次,熔断 ${opts.recoveryTimeoutMs}ms)`,
        );
      }
      throw err;
    }
  }

  /** 查看熔断状态(运维/健康检查用) */
  stateOf(name: string): CircuitStateName {
    return this.circuits.get(name)?.state ?? 'CLOSED';
  }

  private getState(name: string): CircuitState {
    let st = this.circuits.get(name);
    if (!st) {
      st = { state: 'CLOSED', failures: 0 };
      this.circuits.set(name, st);
    }
    return st;
  }

  private normalize(o: CircuitBreakerOptions): Required<Omit<CircuitBreakerOptions, 'fallback' | 'exemptErrors'>> {
    return {
      failureThreshold: o.failureThreshold ?? 5,
      recoveryTimeoutMs: o.recoveryTimeoutMs ?? 10_000,
    };
  }
}
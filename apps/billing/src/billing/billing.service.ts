import { Injectable, Inject, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  CircuitBreaker,
  CreatePaymentDto,
  IdempotencyService,
  Payment,
  PaymentMethod,
  PaymentResultDto,
  PaymentStatus,
  Retryable,
} from '@app/shared';

/** 计费服务 —— 领域逻辑(内存实现) */
@Injectable()
export class BillingService {
  private readonly store = new Map<string, Payment>();
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  /**
   * 创建支付单(@Retryable 演示:调用支付网关的瞬时失败做指数退避重试;
   * 幂等保证重试不产生重复支付单)。
   */
  @Retryable({ maxAttempts: 3, backoffMs: 200 })
  async createPayment(dto: CreatePaymentDto): Promise<PaymentResultDto> {
    const { data } = await this.idempotency.execute(
      `payment:create:${dto.orderId}`,
      86400,
      () => this.doCreatePayment(dto),
    );
    return data;
  }

  private doCreatePayment(dto: CreatePaymentDto): PaymentResultDto {
    const now = new Date().toISOString();
    // 创建支付单:先处于 CREATED(预授权/冻结),等 confirm 才真正扣款
    const payment: Payment = {
      id: randomUUID(),
      orderId: dto.orderId,
      userId: dto.userId,
      amount: dto.amount,
      method: dto.method as PaymentMethod,
      status: PaymentStatus.CREATED,
      createdAt: now,
    };

    this.store.set(payment.id, payment);
    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      status: payment.status,
    };
  }

  /**
   * 确认扣款 —— 模拟支付网关回调(带熔断器,对标 Resilience4j)。
   * 连续失败 threshold 次 -> 熔断,后续请求快速失败(不真的打网关);
   * 熔断期间走 fallback(降级回应)。
   */
  @CircuitBreaker('payment-gateway', {
    failureThreshold: 3,
    recoveryTimeoutMs: 8_000,
    fallback: 'payGatewayFallback',
  })
  async confirmPayment(id: string, simulateFailure = false): Promise<PaymentResultDto> {
    const payment = this.store.get(id);
    if (!payment) throw new Error(`支付单不存在: ${id}`);

    // 已成功的支付:幂等返回,不重复扣款
    if (payment.status === PaymentStatus.SUCCEEDED) {
      return this.toResult(payment);
    }

    if (simulateFailure) {
      // 模拟:支付网关实际扣款成功,但回调/确认环节异常
      payment.status = PaymentStatus.SUCCEEDED;
      payment.paidAt = new Date().toISOString();
      throw new Error('支付网关回调确认失败(模拟),资金已扣减,需退款补偿');
    }

    payment.status = PaymentStatus.SUCCEEDED;
    payment.paidAt = new Date().toISOString();
    return this.toResult(payment);
  }

  /** 熔断降级回应:告诉调用方付款状态待定(并非用户余额问题,而是依赖不可用) */
  private payGatewayFallback(err: Error): PaymentResultDto {
    this.logger.warn(`支付网关熔断降级: ${err.message}`);
    return {
      paymentId: 'unknown',
      orderId: 'unknown',
      status: PaymentStatus.CREATED,
      errorMessage: `支付网关暂不可用,请稍后重试(熔断降级): ${err.message}`,
    };
  }

  findById(id: string): Payment | undefined {
    return this.store.get(id);
  }

  refund(id: string): Payment {
    const payment = this.store.get(id);
    if (!payment) throw new Error(`支付记录不存在: ${id}`);
    if (payment.status !== PaymentStatus.SUCCEEDED) {
      throw new Error(`只有已支付成功的支付单才能退款,当前状态: ${payment.status}`);
    }
    payment.status = PaymentStatus.REFUNDED;
    return payment;
  }

  private toResult(payment: Payment, errorMessage?: string): PaymentResultDto {
    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      status: payment.status,
      paidAt: payment.paidAt,
      errorMessage,
    };
  }
}
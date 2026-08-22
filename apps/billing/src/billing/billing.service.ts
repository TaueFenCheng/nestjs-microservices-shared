import { Injectable, Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  CreatePaymentDto,
  IdempotencyService,
  Payment,
  PaymentMethod,
  PaymentResultDto,
  PaymentStatus,
} from '@app/shared';

/** 计费服务 —— 领域逻辑(内存实现) */
@Injectable()
export class BillingService {
  private readonly store = new Map<string, Payment>();

  constructor(
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  /**
   * 创建支付单(幂等:同一订单只创建一张支付单)。
   * 两步支付模型:create(创建/冻结)-> confirm(确认扣款)。
   */
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
   * 确认扣款 —— 模拟支付网关回调。
   * @param simulateFailure 演示 Saga 补偿:true 时模拟"钱已扣、但确认通知失败",
   *                        此时支付单为 SUCCEEDED,需走退款补偿(状态机不允许	仅取消)。
   */
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
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  CreatePaymentDto,
  Payment,
  PaymentMethod,
  PaymentResultDto,
  PaymentStatus,
} from '@app/shared';

/** 计费服务 —— 领域逻辑(内存实现) */
@Injectable()
export class BillingService {
  private readonly store = new Map<string, Payment>();

  createPayment(dto: CreatePaymentDto): PaymentResultDto {
    const now = new Date().toISOString();
    // 模拟支付网关:固定成功(可扩展接入支付宝/微信/Stripe)
    const payment: Payment = {
      id: randomUUID(),
      orderId: dto.orderId,
      userId: dto.userId,
      amount: dto.amount,
      method: dto.method as PaymentMethod,
      status: PaymentStatus.SUCCEEDED,
      paidAt: now,
    };

    this.store.set(payment.id, payment);
    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      status: payment.status,
      paidAt: payment.paidAt,
    };
  }

  findById(id: string): Payment | undefined {
    return this.store.get(id);
  }

  refund(id: string): Payment {
    const payment = this.store.get(id);
    if (!payment) throw new Error(`支付记录不存在: ${id}`);
    payment.status = PaymentStatus.REFUNDED;
    return payment;
  }
}

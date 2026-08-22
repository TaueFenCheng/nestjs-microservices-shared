import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  ClientProxyFactoryService,
  CreatePaymentDto,
  DistributedLockService,
  MESSAGE_PATTERNS,
  Order,
  OrderStatus,
  OutboxService,
  PaymentMethod,
  PaymentResultDto,
  TOKENS,
} from '@app/shared';

/** 补偿动作记录(生产应持久化,用于审计/对账/人工介入) */
export interface CompensationRecord {
  step: string;
  at: string;
  detail: string;
}

export interface PaymentSagaResult {
  sagaStatus: 'SUCCEEDED' | 'COMPENSATED' | 'PAYMENT_CREATE_FAILED';
  orderId: string;
  order?: Order;
  payment?: PaymentResultDto;
  /** 补偿记录:失败时记录了做过哪些回滚动作 */
  compensations: CompensationRecord[];
  reason?: string;
}

/**
 * 支付 Saga(编排式) —— 分布式事务的"正向 + 反向补偿"演示。
 *
 * 正向流程:
 *   1. 取订单(orders.GET)
 *   2. 创建支付单(billing.CREATE,幂等)
 *   3. 确认扣款(billing.CONFIRM,模拟支付网关)
 *   4. 成功:事件写入 Outbox(可靠投递 payment.succeeded,订单最终变 PAID)
 *
 * 反向补偿(任一步失败):
 *   扣款失败 -> 退款(若有支付单)+ 取消订单,保证"要么全成,要么回滚"。
 *
 * 并发安全:整条 Saga 在分布式锁内执行,同一订单不会并发支付。
 */
@Injectable()
export class PaymentSagaService {
  private readonly logger = new Logger(PaymentSagaService.name);

  constructor(
    private readonly clientFactory: ClientProxyFactoryService,
    private readonly lockService: DistributedLockService,
    private readonly outboxService: OutboxService,
    @Inject(TOKENS.ORDERS_CLIENT) private readonly ordersClient: ClientProxy,
    @Inject(TOKENS.BILLING_CLIENT) private readonly billingClient: ClientProxy,
  ) {}

  async payOrder(orderId: string, simulateFailure = false): Promise<PaymentSagaResult> {
    // 分布式锁:同一订单同时只允许一个支付流程在跑
    return this.lockService.runWithLock(`saga:pay:${orderId}`, 15_000, async () => {
      const compensations: CompensationRecord[] = [];

      // ---- 步骤 1:取订单 ----
      const order = await this.clientFactory.call<{ id: string }, Order>(
        this.ordersClient,
        MESSAGE_PATTERNS.ORDER_GET,
        { id: orderId },
        { requestId: `saga-${orderId}` },
      );

      // ---- 步骤 2:创建支付单(幂等,同一订单只建一张)----
      let created: PaymentResultDto;
      try {
        created = await this.clientFactory.call<CreatePaymentDto, PaymentResultDto>(
          this.billingClient,
          MESSAGE_PATTERNS.PAYMENT_CREATE,
          {
            orderId: order.id,
            userId: order.userId,
            amount: order.totalAmount,
            method: PaymentMethod.ALIPAY,
          },
          { requestId: `saga-${orderId}` },
          8000,
        );
      } catch (err) {
        // 创建支付单失败:取消订单(补偿)
        await this.safeCompensate(compensations, 'ORDER_CANCEL', orderId, async () => {
          await this.clientFactory.call(
            this.ordersClient,
            MESSAGE_PATTERNS.ORDER_CANCEL,
            { orderId, status: OrderStatus.CANCELLED },
            { requestId: `saga-${orderId}` },
          );
        });
        return this.fail(orderId, 'PAYMENT_CREATE_FAILED', err, compensations);
      }

      // ---- 步骤 3:确认扣款(模拟支付网关)----
      let confirmed: PaymentResultDto;
      try {
        confirmed = await this.clientFactory.call<{ id: string; simulateFailure: boolean }, PaymentResultDto>(
          this.billingClient,
          MESSAGE_PATTERNS.PAYMENT_CONFIRM,
          { id: created.paymentId, simulateFailure },
          { requestId: `saga-${orderId}`, userId: order.userId },
          10_000,
        );
      } catch (err) {
        // ---- 补偿:退款(资金已扣,必须退)+ 取消订单(Saga 反向回滚)----
        await this.safeCompensate(compensations, 'PAYMENT_REFUND', created.paymentId, async () => {
          await this.clientFactory.call(
            this.billingClient,
            MESSAGE_PATTERNS.PAYMENT_REFUND,
            { id: created.paymentId },
            { requestId: `saga-${orderId}` },
          );
        });
        await this.safeCompensate(compensations, 'ORDER_CANCEL', orderId, async () => {
          await this.clientFactory.call(
            this.ordersClient,
            MESSAGE_PATTERNS.ORDER_CANCEL,
            { orderId, status: OrderStatus.CANCELLED },
            { requestId: `saga-${orderId}` },
          );
        });
        return this.fail(orderId, 'PAYMENT_CONFIRM_FAILED', err, compensations);
      }

      // ---- 步骤 4:成功 -> 事件写入 Outbox(可靠投递,订单最终 PAID)----
      await this.outboxService.enqueue(MESSAGE_PATTERNS.PAYMENT_SUCCEEDED, {
        orderId: order.id,
        paymentId: created.paymentId,
        userId: order.userId,
        amount: order.totalAmount,
      });

      return {
        sagaStatus: 'SUCCEEDED',
        orderId,
        order,
        payment: confirmed,
        compensations,
      } satisfies PaymentSagaResult;
    });
  }

  /** 补偿动作包装:记录成功与否,不让补偿失败吞掉主流程 */
  private async safeCompensate(
    records: CompensationRecord[],
    step: string,
    target: string,
    fn: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await fn();
      records.push({ step, at: new Date().toISOString(), detail: `回滚成功: ${target}` });
      this.logger.log(`Saga 补偿执行: ${step} (${target})`);
    } catch (err) {
      records.push({ step, at: new Date().toISOString(), detail: `回滚失败: ${(err as Error).message}` });
      this.logger.error(`Saga 补偿失败: ${step} (${target}) ${(err as Error).message}`);
      // 生产:这里应告警 + 进入人工对账流程,而不是静默吞掉
    }
  }

  private fail(
    orderId: string,
    reason: string,
    err: unknown,
    compensations: CompensationRecord[],
  ): PaymentSagaResult {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.warn(`Saga ${reason}: ${orderId} -> ${message}`);
    return {
      sagaStatus: reason === 'PAYMENT_CREATE_FAILED' ? 'PAYMENT_CREATE_FAILED' : 'COMPENSATED',
      orderId,
      reason: message,
      compensations,
    };
  }
}
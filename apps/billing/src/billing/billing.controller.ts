import { Controller, Logger } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { BillingService } from './billing.service';
import {
  ConfirmPaymentDto,
  CreatePaymentDto,
  CircuitBreakerOpenException,
  ErrorCode,
  MESSAGE_PATTERNS,
  Payment,
  PaymentResultDto,
} from '@app/shared';

/**
 * 计费/支付微服务控制器。
 * 演示:业务域错误通过 RpcException 返回,网关统一映射 HTTP 状态码;
 *       两步支付(create -> confirm)-> 失败触发 Saga 补偿。
 */
@Controller()
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(private readonly billingService: BillingService) {}

  /** 步骤1:创建支付单(幂等,同一订单只建一张) */
  @MessagePattern(MESSAGE_PATTERNS.PAYMENT_CREATE)
  async create(@Payload() payload: { data: CreatePaymentDto }): Promise<PaymentResultDto> {
    if (payload.data.amount <= 0) {
      throw new RpcException({ code: ErrorCode.PAYMENT_FAILED, message: '支付金额不合法' });
    }
    return this.billingService.createPayment(payload.data);
  }

  /** 查询支付 */
  @MessagePattern(MESSAGE_PATTERNS.PAYMENT_GET)
  get(@Payload() payload: { data: { id: string } }): Payment {
    const payment = this.billingService.findById(payload.data.id);
    if (!payment) {
      throw new RpcException({ code: ErrorCode.ORDER_NOT_FOUND, message: '支付记录不存在' });
    }
    return payment;
  }

  /** 步骤2:确认扣款(模拟支付网关回调;simulateFailure=true 时模拟失败) */
  @MessagePattern(MESSAGE_PATTERNS.PAYMENT_CONFIRM)
  confirm(@Payload() payload: { data: ConfirmPaymentDto }): Promise<PaymentResultDto> {
    try {
      return this.billingService.confirmPayment(payload.data.id, payload.data.simulateFailure);
    } catch (err) {
      // 熔断快速失败:归为服务不可用(503),与业务失败区分开
      if (err instanceof CircuitBreakerOpenException) {
        throw new RpcException({
          code: ErrorCode.SERVICE_UNAVAILABLE,
          message: err.message,
        });
      }
      // 确认失败是业务失败:抛统一错误码,网关 Saga 捕获后走补偿
      throw new RpcException({
        code: ErrorCode.PAYMENT_FAILED,
        message: (err as Error).message,
      });
    }
  }

  /** 退款(补偿/取消订单时调用) */
  @MessagePattern(MESSAGE_PATTERNS.PAYMENT_REFUND)
  refund(@Payload() payload: { data: { id: string } }): Payment {
    return this.billingService.refund(payload.data.id);
  }

  /**
   * 支付成功后发事件,通知 orders 微服务更新订单状态。
   * 演示:微服务之间通过事件解耦,而不是同步 RPC 串死。
   */
  @EventPattern(MESSAGE_PATTERNS.PAYMENT_CREATE)
  onPaid(@Payload() data: { orderId: string }) {
    this.logger.log(`支付成功,通知订单: ${data.orderId}`);
  }
}
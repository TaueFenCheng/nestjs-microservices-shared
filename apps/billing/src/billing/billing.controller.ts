import { Controller, Logger } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { BillingService } from './billing.service';
import {
  CreatePaymentDto,
  ErrorCode,
  MESSAGE_PATTERNS,
  Payment,
  PaymentResultDto,
} from '@app/shared';
import { RpcException } from '@nestjs/microservices';

/**
 * 计费/支付微服务控制器。
 * 演示:业务域错误通过 RpcException 返回,网关统一映射 HTTP 状态码。
 */
@Controller()
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(private readonly billingService: BillingService) {}

  /** 发起支付 */
  @MessagePattern(MESSAGE_PATTERNS.PAYMENT_CREATE)
  create(@Payload() payload: { data: CreatePaymentDto }): PaymentResultDto {
    // 模拟:金额为负或不合法时抛业务错误
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

  /** 退款 */
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

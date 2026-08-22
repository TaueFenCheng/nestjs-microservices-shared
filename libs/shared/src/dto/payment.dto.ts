import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMethod, PaymentStatus } from '../interfaces/order.interface';

/** 发起支付 —— api-gateway -> billing 微服务 */
export class CreatePaymentDto {
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsNumber({}, { message: '金额必须是数字' })
  @Min(0.01, { message: '金额必须大于 0' })
  amount!: number;

  @IsEnum(PaymentMethod, { message: '不支持的支付方式' })
  method!: PaymentMethod;
}

/** 确认扣款 —— 模拟支付网关回调(两步支付:创建 -> 确认) */
export class ConfirmPaymentDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  /** 仅用于演示 Saga 补偿:true 时模拟网关确认失败 */
  @IsOptional()
  @IsBoolean()
  simulateFailure?: boolean;
}

/** 支付结果(微服务内部流转用) */
export class PaymentResultDto {
  paymentId!: string;
  orderId!: string;
  status!: PaymentStatus;
  paidAt?: string;
  errorMessage?: string;
}

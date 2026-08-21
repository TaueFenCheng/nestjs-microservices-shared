import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '../interfaces/order.interface';

/** 订单条目 */
export class CreateOrderItemDto {
  @IsString()
  @IsNotEmpty({ message: '商品 SKU 不能为空' })
  sku!: string;

  @IsString()
  @IsOptional()
  productName?: string;

  @IsNumber({}, { message: '单价必须是数字' })
  @Min(0.01, { message: '单价必须大于 0' })
  unitPrice!: number;

  @IsNumber({}, { message: '数量必须是数字' })
  @Min(1, { message: '数量至少为 1' })
  quantity!: number;
}

/** 创建订单 —— 由 api-gateway 接收 HTTP 请求后转发给 orders 微服务 */
export class CreateOrderDto {
  @IsString()
  @IsNotEmpty({ message: '用户 ID 不能为空' })
  userId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @IsOptional()
  @IsString()
  remark?: string;
}

/** 订单状态更新(内部服务间调用用) */
export class UpdateOrderStatusDto {
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @IsEnum(OrderStatus, { message: '非法的订单状态' })
  status!: OrderStatus;
}

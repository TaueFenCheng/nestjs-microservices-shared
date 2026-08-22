import { Controller, Logger } from '@nestjs/common';
import {
  Ctx,
  EventPattern,
  MessagePattern,
  Payload,
  RpcException,
} from '@nestjs/microservices';
import { OrdersService } from './orders.service';
import {
  CreateOrderDto,
  ErrorCode,
  MESSAGE_PATTERNS,
  Order,
  OrderStatus,
  PaginatedResult,
  UpdateOrderStatusDto,
} from '@app/shared';
import { RedisContext } from '@nestjs/microservices';

/**
 * 订单微服务控制器。
 * 对比 HTTP 控制器:@MessagePattern 声明订阅的消息模式;
 *              @Payload 取载荷;@Ctx 取传输上下文。
 * 业务与传输完全解耦 —— 换 Kafka/gRPC 只改 main.ts,这里不动。
 */
@Controller()
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(private readonly ordersService: OrdersService) {}

  /** 创建订单(request/reply) */
  @MessagePattern(MESSAGE_PATTERNS.ORDER_CREATE)
  create(
    @Payload() payload: { data: CreateOrderDto; meta: { requestId?: string } },
  ): Promise<Order> {
    this.logger.log(`创建订单 requestId=${payload.meta?.requestId}`);
    return this.ordersService.create(payload.data);
  }

  /** 查询单个订单 */
  @MessagePattern(MESSAGE_PATTERNS.ORDER_GET)
  get(@Payload() payload: { data: { id: string } }): Order {
    const order = this.ordersService.findById(payload.data.id);
    if (!order) {
      throw new RpcException({ code: ErrorCode.ORDER_NOT_FOUND, message: '订单不存在' });
    }
    return order;
  }

  /** 订单列表(分页) */
  @MessagePattern(MESSAGE_PATTERNS.ORDER_LIST)
  list(@Payload() payload: { data: { page?: number; pageSize?: number } }): PaginatedResult<Order> {
    return this.ordersService.findAll(payload.data);
  }

  /** 更新订单状态(内部调用) */
  @MessagePattern(MESSAGE_PATTERNS.ORDER_CANCEL)
  cancel(@Payload() payload: { data: UpdateOrderStatusDto }): Order {
    return this.ordersService.updateStatus(payload.data.orderId, OrderStatus.CANCELLED);
  }

  /**
   * 事件消费者示例。
   * 网关或其他服务 emit 订单支付成功事件后,异步更新订单状态。
   * 事件(Emit)与请求(Message)不同:fire-and-forget,无返回。
   */
  @EventPattern(MESSAGE_PATTERNS.PAYMENT_SUCCEEDED)
  onPaymentSucceeded(@Payload() data: { orderId: string }, @Ctx() context: RedisContext) {
    this.logger.log(`收到支付成功事件 channel=${context.getChannel()}, orderId=${data.orderId}`);
    this.ordersService.updateStatus(data.orderId, OrderStatus.PAID);
  }
}

import { Controller, Logger } from '@nestjs/common';
import {
  Ctx,
  EventPattern,
  MessagePattern,
  Payload,
  RpcException,
} from '@nestjs/microservices';
import { OptimisticLockVersionMismatchError } from 'typeorm';
import { OrdersService } from './orders.service';
import {
  CreateOrderDto,
  ErrorCode,
  MESSAGE_PATTERNS,
  Order,
  OrderStatus,
  PaginatedResult,
  QUEUE_NAMES,
  UpdateOrderStatusDto,
} from '@app/shared';
import { RedisContext, RmqContext } from '@nestjs/microservices';

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
  async get(@Payload() payload: { data: { id: string } }): Promise<Order> {
    const order = await this.ordersService.findById(payload.data.id);
    if (!order) {
      throw new RpcException({ code: ErrorCode.ORDER_NOT_FOUND, message: '订单不存在' });
    }
    return order;
  }

  /** 订单列表(分页,QueryBuilder) */
  @MessagePattern(MESSAGE_PATTERNS.ORDER_LIST)
  list(@Payload() payload: { data: { page?: number; pageSize?: number } }): Promise<PaginatedResult<Order>> {
    return this.ordersService.findAll(payload.data);
  }

  /** 更新订单状态(内部调用,乐观锁) */
  @MessagePattern(MESSAGE_PATTERNS.ORDER_CANCEL)
  async cancel(@Payload() payload: { data: UpdateOrderStatusDto }): Promise<Order> {
    try {
      return await this.ordersService.updateStatus(payload.data.orderId, OrderStatus.CANCELLED);
    } catch (err) {
      // 乐观锁冲突 => 409 冲突(演示错误码映射)
      if (err instanceof OptimisticLockVersionMismatchError) {
        throw new RpcException({
          code: ErrorCode.CONFLICT,
          message: '订单状态已被并发修改,请刷新后重试(乐观锁拦截)',
        });
      }
      throw new RpcException({ code: ErrorCode.INTERNAL_ERROR, message: (err as Error).message });
    }
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

  /**
   * RabbitMQ 队列消费者:订单创建事件(点对点)。
   * 演示手动 ack:处理成功后 ack,异常时 nack 并 requeue(回到队列重试)。
   * 与 Redis broadcast 的区别:这条消息只被消费一次(竞争消费者之间)。
   */
  @EventPattern(QUEUE_NAMES.ORDER_EVENTS_RMQ)
  async onOrderCreatedRmq(@Payload() payload: unknown, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const message = context.getMessage();
    try {
      this.logger.log(`[RMQ] 收到订单创建事件(手动 ack): ${JSON.stringify(payload)}`);
      // 业务处理(示例:记录对账/通知等,这里只是消费确认)
      channel.ack(message); // 确认:消息出队
    } catch (err) {
      this.logger.error(`[RMQ] 处理失败,requeue: ${(err as Error).message}`);
      channel.nack(message, false, true); // requeue,交给后续重试
    }
  }
}

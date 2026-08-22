import { Controller, Get, Post, Body, Param, Query, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  AuthService,
  CreateOrderDto,
  MESSAGE_PATTERNS,
  Public,
  TOKENS,
  UserRole,
  Roles,
  CurrentUser,
  AuthenticatedUser,
  ClientProxyFactoryService,
  QUEUE_NAMES,
} from '@app/shared';
import { LoginDto } from '@app/shared';
import { AuthTokensDto } from '@app/shared';
import { Order } from '@app/shared';
import { PaginationDto } from '@app/shared';
import { PaymentSagaResult, PaymentSagaService } from './saga/payment-saga.service';

/**
 * 网关控制器 —— 编排层示例。
 *
 * 职责:参数校验、鉴权、转发到微服务、聚合结果。
 * 业务逻辑不在此处,全部下沉到 orders / billing 微服务。
 */
@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly clientFactory: ClientProxyFactoryService,
    private readonly paymentSaga: PaymentSagaService,
    @Inject(TOKENS.ORDERS_CLIENT) private readonly ordersClient: ClientProxy,
    @Inject(TOKENS.BILLING_CLIENT) private readonly billingClient: ClientProxy,
    @Inject(TOKENS.ORDERS_RMQ_CLIENT) private readonly ordersRmqClient: ClientProxy,
  ) {}

  // ---------- 鉴权 ----------

  /** 登录(公开接口,演示 @Public()) */
  @Public()
  @Post('auth/login')
  async login(@Body() dto: LoginDto): Promise<AuthTokensDto> {
    const user = await this.authService.validateToken(
      await this.authService.signAccessToken({ id: 'demo-user', email: dto.email, role: UserRole.USER }),
    );
    const accessToken = await this.authService.signAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    return { accessToken, refreshToken: accessToken, expiresIn: 3600 };
  }

  /** 当前用户信息(演示 @CurrentUser()) */
  @Get('auth/me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  // ---------- 订单编排 ----------

  /** 创建订单:调用 orders 微服务(带幂等键防重复下单) */
  @Post('orders')
  async createOrder(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Order> {
    const order = await this.clientFactory.call<CreateOrderDto, Order>(
      this.ordersClient,
      MESSAGE_PATTERNS.ORDER_CREATE,
      { ...dto, userId: user.id },
      { requestId: 'gw-1', userId: user.id },
    );

    // 演示 RabbitMQ 点对点队列:发布订单创建事件(orders 侧手动 ack 消费)
    // 对比 Redis pub/sub 广播:队列语义是"一条消息只被一个消费者处理一次"
    this.ordersRmqClient.emit(QUEUE_NAMES.ORDER_EVENTS_RMQ, {
      orderId: order.id,
      userId: order.userId,
      totalAmount: order.totalAmount,
      ts: Date.now(),
    });
    this.logger.log(`已发布订单事件到 RabbitMQ 队列: ${QUEUE_NAMES.ORDER_EVENTS_RMQ}`);

    return order;
  }

  /** 查询订单:调用 orders 微服务 */
  @Get('orders/:id')
  async getOrder(@Param('id') id: string): Promise<Order> {
    return this.clientFactory.call(
      this.ordersClient,
      MESSAGE_PATTERNS.ORDER_GET,
      { id },
      { requestId: 'gw-2' },
    );
  }

  /** 订单列表(分页) */
  @Get('orders')
  async listOrders(@Query() query: PaginationDto) {
    return this.clientFactory.call(
      this.ordersClient,
      MESSAGE_PATTERNS.ORDER_LIST,
      query,
      { requestId: 'gw-3' },
    );
  }

  // ---------- 支付编排 ----------

  /**
   * 对订单发起支付:支付 Saga(分布式锁 + 两步支付 + 失败自动补偿)。
   * ?simulateFailure=true 时模拟支付网关失败,演示 Saga 反向补偿(退款+取消订单)。
   */
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post('orders/:id/pay')
  async payOrder(
    @Param('id') orderId: string,
    @Query('simulateFailure') simulateFailure?: string,
  ): Promise<PaymentSagaResult> {
    return this.paymentSaga.payOrder(orderId, simulateFailure === 'true');
  }
}

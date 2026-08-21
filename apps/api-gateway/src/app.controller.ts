import { Controller, Get, Post, Body, Param, Query, Inject } from '@nestjs/common';
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
} from '@app/shared';
import { LoginDto } from '@app/shared';
import { AuthTokensDto } from '@app/shared';
import { Order } from '@app/shared';
import { PaginationDto } from '@app/shared';

/**
 * 网关控制器 —— 编排层示例。
 *
 * 职责:参数校验、鉴权、转发到微服务、聚合结果。
 * 业务逻辑不在此处,全部下沉到 orders / billing 微服务。
 */
@Controller()
export class AppController {
  constructor(
    private readonly authService: AuthService,
    private readonly clientFactory: ClientProxyFactoryService,
    @Inject(TOKENS.ORDERS_CLIENT) private readonly ordersClient: ClientProxy,
    @Inject(TOKENS.BILLING_CLIENT) private readonly billingClient: ClientProxy,
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

  /** 创建订单:调用 orders 微服务 */
  @Post('orders')
  async createOrder(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Order> {
    return this.clientFactory.call(
      this.ordersClient,
      MESSAGE_PATTERNS.ORDER_CREATE,
      { ...dto, userId: user.id },
      { requestId: 'gw-1', userId: user.id },
    );
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

  /** 对订单发起支付:调用 billing 微服务(演示多服务编排 + 角色控制) */
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post('orders/:id/pay')
  async payOrder(@Param('id') orderId: string) {
    // 1. 先取订单(orders)
    const order = await this.clientFactory.call<{ id: string }, Order>(
      this.ordersClient,
      MESSAGE_PATTERNS.ORDER_GET,
      { id: orderId },
      { requestId: 'gw-pay-1' },
    );

    // 2. 再发起支付(billing),演示"编排 + 数据聚合"
    return this.clientFactory.call(
      this.billingClient,
      MESSAGE_PATTERNS.PAYMENT_CREATE,
      { orderId: order.id, userId: order.userId, amount: order.totalAmount, method: 'ALIPAY' },
      { requestId: 'gw-pay-2', userId: order.userId },
    );
  }
}

import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  CreateOrderDto,
  IdempotencyService,
  Order,
  OrderStatus,
  PaginatedResult,
} from '@app/shared';

/**
 * 订单服务 —— 领域逻辑。
 * 使用内存 Map 存储(演示用),生产替换为 TypeORM/Prisma。
 *
 * 高级特性演示:
 *  - OnModuleInit 生命周期钩子(初始化种子数据);
 *  - 幂等创建:同一 idempotencyKey 重复提交只创建一单(防重复下单)。
 */
@Injectable()
export class OrdersService implements OnModuleInit {
  private readonly store = new Map<string, Order>();

  constructor(
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  async onModuleInit() {
    // 生命周期钩子:启动时初始化(真实场景:建表、预置数据)
  }

  /**
   * 创建订单(幂等)。
   * 客户端带 idempotencyKey 时,重复请求返回首次创建的同一订单;
   * 不带则退化为普通创建(向后兼容)。
   */
  create(dto: CreateOrderDto): Promise<Order> {
    if (!dto.idempotencyKey) {
      return Promise.resolve(this.doCreate(dto));
    }
    return this.idempotency
      .execute(`order:create:${dto.idempotencyKey}`, 86400, async () => this.doCreate(dto))
      .then(({ data }) => data);
  }

  /** 真正的下单逻辑(防篡改:金额一律服务端计算) */
  private doCreate(dto: CreateOrderDto): Order {
    const totalAmount = dto.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const now = new Date().toISOString();

    const order: Order = {
      id: randomUUID(),
      userId: dto.userId,
      items: dto.items,
      totalAmount,
      status: OrderStatus.PENDING,
      remark: dto.remark,
      createdAt: now,
      updatedAt: now,
    };

    this.store.set(order.id, order);
    return order;
  }

  findById(id: string): Order | undefined {
    return this.store.get(id);
  }

  findAll(query: { page?: number; pageSize?: number }): PaginatedResult<Order> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const all = Array.from(this.store.values());
    const start = (page - 1) * pageSize;
    const items = all.slice(start, start + pageSize);

    return {
      items,
      total: all.length,
      page,
      pageSize,
      totalPages: Math.ceil(all.length / pageSize),
    };
  }

  updateStatus(id: string, status: OrderStatus): Order {
    const order = this.store.get(id);
    if (!order) throw new Error(`订单不存在: ${id}`);
    order.status = status;
    order.updatedAt = new Date().toISOString();
    return order;
  }
}
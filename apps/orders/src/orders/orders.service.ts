import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  CreateOrderDto,
  Order,
  OrderStatus,
  PaginatedResult,
} from '@app/shared';

/**
 * 订单服务 —— 领域逻辑。
 * 使用内存 Map 存储(演示用),生产替换为 TypeORM/Prisma。
 * 实现 OnModuleInit 演示生命周期钩子(如初始化种子数据)。
 */
@Injectable()
export class OrdersService implements OnModuleInit {
  private readonly store = new Map<string, Order>();

  async onModuleInit() {
    // 生命周期钩子:启动时初始化(真实场景:建表、预置数据)
  }

  create(dto: CreateOrderDto): Order {
    // 关键:金额由服务端计算,绝对不信赖客户端传值 —— 防篡改
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

import { Injectable, Logger } from '@nestjs/common';
import { CreateOrderDto, Order, OrderStatus, PaginatedResult } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Prisma 版订单演示 —— 与 TypeORM 版 OrdersService 对照。
 * 关注点差异:
 *  - 无实体类、无 Repository:一切查询都是 PrismaClient 上的生成方法;
 *  - $transaction:数组式批处理事务(与 TypeORM 的 @Transactional 对照);
 *  - 纯类型安全:model 形状来自 generate 产物,编译期校验字段。
 */
@Injectable()
export class PrismaDemoService {
  private readonly logger = new Logger(PrismaDemoService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建订单(@Prisma 演示主入口):
   * 同一 $transaction 里同时写订单表 + 审计日志 —— 完全对应 TypeORM 版
   * @Transactional 的"业务写 + outbox 写同事务"语义,全成或全败。
   */
  async createOrder(dto: CreateOrderDto): Promise<Order> {
    const totalAmount = dto.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

    const [order] = await this.prisma.client.$transaction([
      this.prisma.client.prismaOrder.create({
        data: {
          userId: dto.userId,
          items: dto.items as unknown as object,
          totalAmount,
          status: OrderStatus.PENDING,
          remark: dto.remark ?? null,
        },
      }),
      this.prisma.client.prismaAuditLog.create({
        data: { action: 'ORDER_CREATED', detail: `userId=${dto.userId} total=${totalAmount}` },
      }),
    ]);

    this.logger.log(`[Prisma] 事务创建订单 ${order.id}(含审计日志)`);
    return this.toOrder(order);
  }

  /** 分页列表(Prisma 原生分页 skip/take,对照 QueryBuilder 版) */
  async listOrders(query: { page?: number; pageSize?: number }): Promise<PaginatedResult<Order>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.prismaOrder.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.client.prismaOrder.count(),
    ]);
    return {
      items: items.map((o) => this.toOrder(o)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const order = await this.prisma.client.prismaOrder.findUnique({ where: { id } });
    return order ? this.toOrder(order) : undefined;
  }

  /** 表数量统计(演示用的辅助端点) */
  async stats(): Promise<{ orders: number; auditLogs: number }> {
    const [orders, auditLogs] = await this.prisma.client.$transaction([
      this.prisma.client.prismaOrder.count(),
      this.prisma.client.prismaAuditLog.count(),
    ]);
    return { orders, auditLogs };
  }

  private toOrder(o: {
    id: string;
    userId: string;
    items: unknown;
    totalAmount: { toString(): string } | number;
    status: string;
    remark: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Order {
    return {
      id: o.id,
      userId: o.userId,
      items: Array.isArray(o.items) ? (o.items as unknown as Order['items']) : [],
      totalAmount: Number(o.totalAmount),
      status: o.status as OrderStatus,
      remark: o.remark ?? undefined,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    };
  }
}
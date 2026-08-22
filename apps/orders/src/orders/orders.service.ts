import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, OptimisticLockVersionMismatchError, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  CreateOrderDto,
  IdempotencyService,
  Order,
  OrderStatus,
  PaginatedResult,
  QueueService,
  Transactional,
  TransactionManager,
} from '@app/shared';
import { OrderEntity } from '../entities/order.entity';

/**
 * 订单服务 —— 真实存储层(TypeORM + PostgreSQL)版本。
 * 与内存版的区别:store 换成 Repository,并在写入路径演示：
 *  - 幂等创建(同一 idempotencyKey 只建一单);
 *  - 队列调度(超时自动取消);
 *  - 乐观锁更新(updateStatus 失败抛版本冲突)。
 */
@Injectable()
export class OrdersService implements OnModuleInit {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
    private readonly queueService: QueueService,
    @InjectRepository(OrderEntity) private readonly repo: Repository<OrderEntity>,
    @InjectDataSource('slave') private readonly slaveDs: DataSource,
  ) {}

  async onModuleInit() {
    // 生命周期钩子:启动时初始化(真实场景:建表、预置数据)
  }

  /**
   * 创建订单(幂等)。客户端带 idempotencyKey 时,重复请求返回首次创建的同一订单。
   * 写入 PostgreSQL;金额服务端计算,不信赖客户端。
   */
  create(dto: CreateOrderDto): Promise<Order> {
    if (!dto.idempotencyKey) {
      return this.doCreate(dto).then((o) => {
        void this.scheduleAutoCancel(o);
        return o;
      });
    }
    return this.idempotency
      .execute(`order:create:${dto.idempotencyKey}`, 86400, async () => this.doCreate(dto))
      .then(({ data }) => {
        void this.scheduleAutoCancel(data);
        return data;
      });
  }

  /**
   * 真正写库 —— 声明式事务(@Transactional 对标 Spring)。
   * @TransactionManager() 注入当前事务 EntityManager:同事务多写要么全成要么全回滚。
   */
  @Transactional()
  private async doCreate(
    dto: CreateOrderDto,
    @TransactionManager() em?: EntityManager,
  ): Promise<Order> {
    const totalAmount = dto.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const repo = em ? em.getRepository(OrderEntity) : this.repo;
    const entity = repo.create({
      id: randomUUID(),
      userId: dto.userId,
      items: dto.items,
      totalAmount,
      status: OrderStatus.PENDING,
      remark: dto.remark ?? null,
    });
    const saved = await repo.save(entity);
    // 演示:事务内可继续多次写(订单 + 其他表),任一步失败整体回滚
    return this.toOrder(saved);
  }

  async findById(id: string): Promise<Order | undefined> {
    const entity = await this.repo.findOneBy({ id });
    return entity ? this.toOrder(entity) : undefined;
  }

  async findAll(query: { page?: number; pageSize?: number }): Promise<PaginatedResult<Order>> {
    // 读写分离:读查询显式走只读副本(slave)。生产环境 slave 为独立只读实例。
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const repo = this.slaveDs.getRepository(OrderEntity);
    const [items, total] = await repo
      .createQueryBuilder('o')
      .orderBy('o.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      items: items.map((e) => this.toOrder(e)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 更新订单状态 —— 乐观锁演示(对标 JPA @Version / MyBatis-Plus 乐观锁)。
   * 原理:UPDATE 时显式携带期望版本号 `WHERE version = :expected`;
   * 若期间版本已被其他事务 +1,affected = 0 => 抛乐观锁冲突错误。
   *
   * 注:TypeORM save() 不做自动版本检查,必须显式条件(官方 setLock('optimistic')
   * 或本例的 where+affected 方案),否则会出现"后写覆盖前写"的丢失更新。
   */
  async updateStatus(id: string, status: OrderStatus): Promise<Order> {
    const entity = await this.repo.findOneBy({ id });
    if (!entity) throw new Error(`订单不存在: ${id}`);

    const result = await this.repo
      .createQueryBuilder()
      .update(OrderEntity)
      .set({ status })
      .where('id = :id AND version = :expected', {
        id,
        expected: entity.version,
      })
      .execute();

    if (result.affected === 0) {
      // 版本不匹配:并发修改已发生,拒绝本次写入(防止丢失更新)
      throw new OptimisticLockVersionMismatchError(
        OrderEntity.name,
        entity.version,
        entity.version + 1,
      );
    }

    const fresh = await this.repo.findOneBy({ id });
    return this.toOrder(fresh!);
  }

  /** 调度超时自动取消;调度失败不影响下单(仅告警) */
  private scheduleAutoCancel(order: Order): void {
    const delaySeconds = Number(process.env.ORDER_AUTO_CANCEL_SECONDS ?? 1800);
    this.queueService
      .scheduleOrderAutoCancel(order.id, delaySeconds * 1000)
      .catch((err) => this.logger.warn(`调度订单超时任务失败: ${order.id} ${(err as Error).message}`));
  }

  private toOrder(e: OrderEntity): Order {
    return {
      id: e.id,
      userId: e.userId,
      items: e.items,
      totalAmount: e.totalAmount,
      status: e.status,
      remark: e.remark ?? undefined,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }
}
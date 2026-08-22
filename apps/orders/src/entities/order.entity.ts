import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { CreateOrderItemDto, OrderStatus } from '@app/shared';

/**
 * 订单实体 —— TypeORM 映射。
 *
 * 与内存版 OrdersService 对应的真实存储层。高级特性:
 *  - @VersionColumn:乐观锁,并发更新时版本号不匹配即抛
 *    OptimisticLockVersionMismatchError(对标 JPA @Version);
 *  - jsonb:条目明细以 JSON 存储(演示复杂列类型/transformer);
 *  - 时间戳列:CreateDateColumn / UpdateDateColumn 自动维护。
 */
@Entity('orders')
export class OrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  /** 条目明细:jsonb 存储(transformer 自动序列化/反序列化) */
  @Column('jsonb', {
    transformer: {
      to: (value: CreateOrderItemDto[]) => JSON.stringify(value ?? []),
      from: (value: string) => (value ? JSON.parse(value) : []),
    },
  })
  items!: CreateOrderItemDto[];

  /** 订单总额(分),服务端计算 */
  @Column('double precision')
  totalAmount!: number;

  @Column({ default: OrderStatus.PENDING })
  status!: OrderStatus;

  @Column({ nullable: true, type: 'varchar' })
  remark?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  /** 乐观锁版本:每次 UPDATE 自动 +1 */
  @VersionColumn()
  version!: number;
}
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ModuleRef } from '@nestjs/core';
import { AsyncLocalStorage } from 'async_hooks';
import { DataSource, EntityManager } from 'typeorm';

interface TransactionContext {
  manager: EntityManager;
}

/**
 * 事务服务 —— 基于 TypeORM DataSource 的声明式事务底座。
 *
 * 设计要点:
 *  - AsyncLocalStorage(与现有 RequestContext 同技术):事务期间的
 *    EntityManager 自动传播,嵌套调用无需传参;
 *  - 由 @Transactional 装饰器调用 runInTransaction,业务代码零侵入;
 *  - @TransactionManager() 参数装饰器从上下文取事务 em。
 *    对标 Java:Spring 的 @Transactional + EntityManager 注入。
 */
@Injectable()
export class TransactionService implements OnModuleInit {
  private readonly logger = new Logger(TransactionService.name);
  private readonly storage = new AsyncLocalStorage<TransactionContext>();
  private dataSource?: DataSource;

  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit(): void {
    // strict:false 允许从全局容器拿 TypeORM 默认 DataSource(由 DatabaseModule 注册)。
    // 未接入 TypeORM 的服务(如 billing 的 memory 模式)取不到 => 事务退化、仅告警。
    try {
      this.dataSource = this.moduleRef.get<DataSource>(getDataSourceToken(), { strict: false });
      this.logger.log('事务服务就绪(DataSource 已解析)');
    } catch {
      this.logger.warn('未检测到 TypeORM DataSource,@Transactional 将退化为直接执行');
    }
    setTransactionRegistry(this);
  }

  /** 在事务中执行 fn,事务 EntityManager 可通过 ALS 获取 */
  runInTransaction<T>(fn: (manager: EntityManager) => Promise<T> | T): Promise<T> {
    if (!this.dataSource) {
      // 未接库降级:直接执行(manager 参数为 undefined)
      return Promise.resolve(fn(undefined as unknown as EntityManager));
    }
    return this.dataSource.transaction(async (manager) =>
      this.storage.run({ manager }, () => fn(manager)) as Promise<T>,
    );
  }

  /** 获取当前事务 EntityManager;无事务上下文时返回 undefined */
  getManager(): EntityManager | undefined {
    return this.storage.getStore()?.manager;
  }
}

// ---------- 注册表(装饰器运行时懒取) ----------
let txnRegistry: TransactionService | null = null;
export function setTransactionRegistry(instance: TransactionService | null): void {
  txnRegistry = instance;
}
export function getTransactionRegistry(): TransactionService | null {
  return txnRegistry;
}
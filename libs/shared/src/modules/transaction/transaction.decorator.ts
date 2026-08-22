import 'reflect-metadata';
import { EntityManager } from 'typeorm';
import { getTransactionRegistry } from './transaction.service';

/** 参数装饰器:标记方法参数为"当前事务 EntityManager" */
export function TransactionManager(): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    const key = propertyKey as string;
    const existing: number[] =
      Reflect.getMetadata('transaction:managerIndex', target as object, key) ?? [];
    Reflect.defineMetadata(
      'transaction:managerIndex',
      [...existing, parameterIndex],
      target as object,
      key,
    );
  };
}

/** 按元数据记录的 index 注入 manager 参数 */
function fillManagerArgs(
  args: unknown[],
  managerIndexes: number[],
  manager: EntityManager | undefined,
): unknown[] {
  if (managerIndexes.length === 0) return args;
  const next = [...args];
  for (const index of managerIndexes) {
    next.splice(index, 0, manager);
  }
  return next;
}

/**
 * 声明式事务注解 —— 对标 Spring @Transactional。
 *
 * 用法:
 *   @Transactional()
 *   async doCreate(@TransactionManager() em: EntityManager) {
 *     await em.save(...);          // 事务内写
 *     await em.save(...);          // 同事务,要么全成要么全回滚
 *   }
 *
 * 实现:方法装饰器替换原方法,运行时装扮成事务执行;
 * 可与其他装饰器(@CircuitBreaker 等)组合,无事务环境自动降级。
 */
export function Transactional(): MethodDecorator {
  return (target, propertyKey, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (...args: unknown[]) => unknown;
    const managerIndexes: number[] = Reflect.getMetadata(
      'transaction:managerIndex',
      target as object,
      propertyKey as string,
    ) ?? [];

    descriptor.value = function (this: unknown, ...args: unknown[]): unknown {
      const service = getTransactionRegistry();
      if (!service) {
        return original.apply(this, fillManagerArgs(args, managerIndexes, undefined));
      }
      return service.runInTransaction(async (manager) =>
        original.apply(this, fillManagerArgs(args, managerIndexes, manager)),
      );
    };
  };
}
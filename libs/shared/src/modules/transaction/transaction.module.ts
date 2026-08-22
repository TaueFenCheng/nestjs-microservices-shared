import { Global, Module } from '@nestjs/common';
import { TransactionService } from './transaction.service';

/**
 * 事务模块 —— 提供 @Transactional / @TransactionManager 能力。
 * @Global;实例注册表由 TransactionService.onModuleInit 完成。
 * 不强制依赖 TypeORM:未接库的服务自动降级为直接执行。
 */
@Global()
@Module({
  providers: [TransactionService],
  exports: [TransactionService],
})
export class TransactionModule {}
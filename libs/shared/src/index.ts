/**
 * ============================================================
 * @app/shared —— 公共库统一出口
 * ============================================================
 * 这里是共享库的"公开面"(public surface)。
 * 微服务只能通过本文件暴露的内容使用公共能力;
 * 内部实现细节一律不导出,防止各服务与内部结构耦合。
 *
 * 约定:所有跨服务共享的类型/模块/工具必须在此显式 re-export,
 *       `tsconfig.lib.json` 不设 strict 导出限制时靠人肉维护此文件。
 *       如需强制,可配合 eslint-plugin-import 的 import/no-internal-modules。
 * ============================================================
 */

// ---------- DTO(跨服务传输的数据结构) ----------
export * from './dto/pagination.dto';
export * from './dto/service-response.dto';
export * from './dto/order.dto';
export * from './dto/payment.dto';
export * from './dto/user.dto';

// ---------- 接口 / 类型 ----------
export * from './interfaces/order.interface';
export * from './interfaces/user.interface';
export * from './interfaces/service-request.interface';

// ---------- 常量 ----------
export * from './constants/error-codes';
export * from './constants/message-patterns';
export * from './constants/tokens';

// ---------- 公共模块 ----------
export * from './modules/logger/logger.module';
export * from './modules/logger/logger.service';
export * from './modules/database/database.module';
export * from './modules/database/database.service';
export * from './modules/auth/auth.module';
export * from './modules/auth/auth.service';
export * from './modules/auth/jwt-auth.guard';
export * from './modules/auth/roles.guard';
export * from './modules/auth/roles.decorator';
export * from './modules/auth/public.decorator';
export * from './modules/auth/current-user.decorator';
export * from './modules/health/health.module';

// ---------- 微服务抽象 ----------
export * from './microservices/clients.module';
export * from './microservices/client-proxy.factory';

// ---------- 横切关注点 ----------
export * from './filters/all-exceptions.filter';
export * from './filters/rpc-exception.filter';
export * from './interceptors/transform.interceptor';
export * from './interceptors/request-id.interceptor';
export * from './interceptors/logging.interceptor';

// ---------- 管道 ----------
export * from './pipes/validation.pipe';

// ---------- 工具 ----------
export * from './utils/request-context';

// ---------- 聚合模块 ----------
export * from './shared.module';

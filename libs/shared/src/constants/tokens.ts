/**
 * DI token 常量 —— 自定义 provider 的注入键统一在这里声明,
 * 避免魔法字符串散落代码库。
 */
export const TOKENS = {
  /** 应用名称(useValue 注入) */
  APP_NAME: Symbol('APP_NAME'),
  /** 数据库连接(useFactory 创建) */
  DATABASE_CONNECTION: Symbol('DATABASE_CONNECTION'),
  /** 数据库连接选项(forRoot 传入) */
  DATABASE_OPTIONS: Symbol('DATABASE_OPTIONS'),
  /** JWT 模块配置 */
  JWT_CONFIG: Symbol('JWT_CONFIG'),
  /** Redis 客户端(forRoot 创建) */
  REDIS_CLIENT: Symbol('REDIS_CLIENT'),
  /** 订单服务客户端代理(网关注入) */
  ORDERS_CLIENT: Symbol('ORDERS_CLIENT'),
  /** 计费服务客户端代理(网关注入) */
  BILLING_CLIENT: Symbol('BILLING_CLIENT'),
  /** Outbox 发布客户端(relay 用它 emit 事件) */
  OUTBOX_CLIENT: Symbol('OUTBOX_CLIENT'),
  /** Outbox relay 轮询间隔(毫秒) */
  OUTBOX_RELAY_INTERVAL_MS: Symbol('OUTBOX_RELAY_INTERVAL_MS'),
} as const;

export type Token = (typeof TOKENS)[keyof typeof TOKENS];

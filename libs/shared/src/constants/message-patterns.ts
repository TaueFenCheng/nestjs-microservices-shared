/**
 * 消息模式常量表 —— 微服务间契约的"单一事实来源"。
 *
 * 为什么必须集中管理?
 *  - Redis/TCP transport 的 pattern 是裸字符串或 { cmd } 对象,
 *    散落在各服务里极易拼写错误且无编译期检查;
 *  - 集中在共享库后,改名时全局可搜索,新增时一目了然;
 *  - 与 ClientProxy 封装配合,调用方不直接接触字符串。
 */
export const MESSAGE_PATTERNS = {
  // ---- 订单域(orders 微服务) ----
  ORDER_CREATE: { cmd: 'order.create' },
  ORDER_GET: { cmd: 'order.get' },
  ORDER_LIST: { cmd: 'order.list' },
  ORDER_CANCEL: { cmd: 'order.cancel' },
  ORDER_STATUS_CHANGED: 'order.status.changed', // 事件(不等待响应)

  // ---- 支付/计费域(billing 微服务) ----
  PAYMENT_CREATE: { cmd: 'payment.create' },
  PAYMENT_GET: { cmd: 'payment.get' },
  PAYMENT_REFUND: { cmd: 'payment.refund' },
  PAYMENT_SUCCEEDED: 'payment.succeeded', // 事件

  // ---- 用户域(示例,可扩展 user 微服务) ----
  USER_GET: { cmd: 'user.get' },
  USER_VALIDATE_TOKEN: { cmd: 'user.validate-token' },
} as const;

/** 事件名集中定义(配合 @nestjs/event-emitter 进程内事件) */
export const DOMAIN_EVENTS = {
  ORDER_CREATED: 'order.created',
  ORDER_PAID: 'order.paid',
  PAYMENT_SUCCEEDED: 'payment.succeeded',
} as const;

export type MessagePatternKey = keyof typeof MESSAGE_PATTERNS;

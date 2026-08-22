/**
 * 队列名常量 —— BullMQ 队列的"单一事实来源"。
 * 与 MESSAGE_PATTERNS 同理:队列名集中管理,避免字符串散落。
 */
export const QUEUE_NAMES = {
  /** 订单治理队列:延迟任务(下单未支付自动取消等) */
  ORDER_TIMEOUT: 'order-timeout',
} as const;

/** 队列任务名 */
export const QUEUE_JOB_NAMES = {
  /** 订单超时未支付,自动取消 */
  ORDER_AUTO_CANCEL: 'order-auto-cancel',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
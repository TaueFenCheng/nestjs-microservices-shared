/**
 * 订单领域模型。
 * 注意:领域实体放在共享库中,各微服务对同一业务概念持有唯一权威定义,
 * 避免出现"每个服务各自画一张订单表"的数据烟囱。
 */

export enum OrderStatus {
  PENDING = 'PENDING', // 待支付
  PAID = 'PAID', // 已支付
  SHIPPED = 'SHIPPED', // 已发货
  COMPLETED = 'COMPLETED', // 已完成
  CANCELLED = 'CANCELLED', // 已取消
}

export enum PaymentMethod {
  ALIPAY = 'ALIPAY',
  WECHAT = 'WECHAT',
  CARD = 'CARD',
}

export enum PaymentStatus {
  CREATED = 'CREATED',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export interface OrderItem {
  sku: string;
  productName?: string;
  unitPrice: number;
  quantity: number;
}

export interface Order {
  id: string;
  userId: string;
  items: OrderItem[];
  /** 订单总额(分),由服务端计算,不信赖客户端传值 */
  totalAmount: number;
  status: OrderStatus;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  orderId: string;
  userId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  paidAt?: string;
}

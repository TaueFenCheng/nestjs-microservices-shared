import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CreateOrderDto } from '@app/shared';
import { PrismaDemoService } from './prisma-demo.service';

/** clientFactory.call 的统一信封:{ data, meta } —— 与 OrdersController 解包方式一致 */
interface Envelope<T> {
  data: T;
  meta?: { requestId?: string };
}

/**
 * Prisma 对照演示控制器 —— 通过 Redis RPC pattern 暴露(与 OrdersController 同模式),
 * 由 API 网关转发调用。三个 pattern 对应 TypeORM 版订单的三个主接口。
 */
@Controller()
export class PrismaDemoController {
  private readonly logger = new Logger(PrismaDemoController.name);

  constructor(private readonly prismaDemoService: PrismaDemoService) {}

  @MessagePattern('prisma.order.create')
  create(@Payload() payload: Envelope<CreateOrderDto>) {
    return this.prismaDemoService.createOrder(payload.data);
  }

  @MessagePattern('prisma.order.list')
  list(@Payload() payload: Envelope<{ page?: number; pageSize?: number }>) {
    return this.prismaDemoService.listOrders(payload.data);
  }

  @MessagePattern('prisma.order.get')
  get(@Payload() payload: Envelope<{ id: string }>) {
    return this.prismaDemoService.getOrder(payload.data.id);
  }

  @MessagePattern('prisma.order.stats')
  stats(@Payload() payload: Envelope<unknown>) {
    return this.prismaDemoService.stats();
  }
}
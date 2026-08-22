import { DynamicModule, Module } from '@nestjs/common';
import { ClientOptions, ClientProxyFactory, Transport } from '@nestjs/microservices';
import { TOKENS } from '../constants/tokens';

export interface MicroserviceClientOptions {
  transport: Transport;
  host?: string;
  port?: number;
  /** RabbitMQ:AMQP 连接串,如 amqp://guest:guest@localhost:5672 */
  url?: string;
  /** RabbitMQ 队列名 / Kafka topic */
  queue?: string;
  brokers?: string[];
  /** 额外透传给 ClientProxyFactory.create 的选项 */
  extra?: Record<string, unknown>;
}

/**
 * 微服务客户端模块 —— 传输层封装的终点。
 *
 * 网关(或需要调用其他服务的服务)通过 forFeature 注册:
 *   ClientsModule.forFeature([
 *     { provide: TOKENS.ORDERS_CLIENT,  options: { transport: Transport.REDIS, host, port } },
 *     { provide: TOKENS.BILLING_CLIENT, options: { transport: Transport.TCP, port: 4001 } },
 *   ])
 *
 * 好处:
 *   - 业务代码只注入 ClientProxy,感知不到底层是 Redis/Kafka/gRPC;
 *   - 切换传输协议只改这里一处;
 *   - 所有客户端统一在这里配置重试、序列化等公共选项。
 */
@Module({})
export class ClientsModule {
  static forFeature(
    clients: Array<{ provide: symbol | string; options: MicroserviceClientOptions }>,
  ): DynamicModule {
    const providers = clients.map(({ provide, options }) => ({
      provide,
      useFactory: () =>
        ClientProxyFactory.create({
          transport: options.transport,
          options: {
            host: options.host,
            port: options.port,
            queue: options.queue,
            brokers: options.brokers,
            // RabbitMQ 需要 urls 数组形式
            ...(options.url ? { urls: [options.url] } : {}),
            ...options.extra,
          },
        } as ClientOptions),
    }));

    return {
      module: ClientsModule,
      providers,
      exports: providers.map((p) => p.provide),
    };
  }

  /** 便捷方法:注册所有标准微服务客户端(订单 + 计费) */
  static forStandardClients(config: {
    orders: MicroserviceClientOptions;
    billing: MicroserviceClientOptions;
  }): DynamicModule {
    return ClientsModule.forFeature([
      { provide: TOKENS.ORDERS_CLIENT, options: config.orders },
      { provide: TOKENS.BILLING_CLIENT, options: config.billing },
    ]);
  }
}

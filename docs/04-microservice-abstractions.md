# 04 · 微服务传输层抽象

> 目标:让业务代码**不感知底层 broker**,并讲清请求-响应与事件的差别,
> 以及超时、重试、链路透传等生产关键点。

---

## 1. 问题:为什么业务不能碰"传输细节"

```ts
// ✗ 反模式:业务代码直接创建裸 ClientProxy、写死 pattern 字符串
const client = ClientProxyFactory.create({ transport: Transport.REDIS, options: {...} });
client.send({ cmd: 'order.create' }, data).toPromise();
```

一旦业务层到处都是 `Transport.X` 与 pattern 字符串,将来：
- 换 Kafka/gRPC 要改所有调用方;
- pattern 拼错无编译期检查;
- 超时、重试、鉴权头透传无法统一。

---

## 2. 两级抽象(示例的落地)

### 2.1 第一级:`ClientsModule` 统一创建客户端

```ts
// 共享库
@Module({})
export class ClientsModule {
  static forFeature(clients: Array<{ provide; options: MicroserviceClientOptions }>): DynamicModule {
    const providers = clients.map(({ provide, options }) => ({
      provide,
      useFactory: () => ClientProxyFactory.create({ transport: options.transport, options: { host, port, ... } }),
    }));
    return { module: ClientsModule, providers, exports: providers.map(p => p.provide) };
  }
}

// 网关
ClientsModule.forFeature([
  { provide: TOKENS.ORDERS_CLIENT,  options: { transport: Transport.REDIS, host, port } },
  { provide: TOKENS.BILLING_CLIENT, options: { transport: Transport.TCP, port: 4001 } },
])
```

### 2.2 第二级:`ClientProxyFactoryService` 统一调用语义

业务代码不再直接碰 `client.send(...)` 的底层细节，而是用一个薄封装：

```ts
@Injectable()
export class ClientProxyFactoryService {
  async call<R>(client: ClientProxy, pattern: unknown, data: unknown, meta: RequestMeta, timeoutMs = 5000): Promise<R> {
    return firstValueFrom(
      client.send(pattern, { data, meta }).pipe(timeout(timeoutMs)),
    ) as Promise<R>;
  }

  emit(client: ClientProxy, pattern: unknown, data: unknown): void {
    client.emit(pattern, data).subscribe({ error: (e) => console.error(e) });
  }
}
```

这样调用方写的是 `clientFactory.call(client, MESSAGE_PATTERNS.ORDER_GET, { id }, meta)`,
语义清晰、可加统一超时/重试/埋点。

---

## 3. 请求-响应(`@MessagePattern`)与事件(`@EventPattern`)

| | `@MessagePattern` | `@EventPattern` |
|---|---|---|
| 语义 | 请求，等待应答 (RPC) | 广播，发后即忘 (fire-and-forget) |
| 客户端 | `client.send()` | `client.emit()` |
| 典型场景 | 查订单、下单、支付 | 订单已创建、支付成功通知 |
| 可靠性 | 需要超时/重试 | 消费方异步处理，可幂等重放 |

示例(orders 服务)：

```ts
@MessagePattern(MESSAGE_PATTERNS.ORDER_CREATE)   // 请求-响应
create(@Payload() p) { return this.orders.create(p.data); }

@EventPattern(MESSAGE_PATTERNS.PAYMENT_SUCCEEDED) // 事件
onPaid(@Payload() data, @Ctx() context: RedisContext) {
  this.orders.updateStatus(data.orderId, OrderStatus.PAID);
}
```

> 何时用事件而非 RPC?当"通知的副作用"不需要立即可靠返回、且可能多个消费者时，
> 用事件解耦；当调用方**依赖结果继续后续流程**时(如下单后立即返回订单号)，
> 用 request/reply。

---

## 4. 传输选择(Redis vs Kafka vs gRPC vs NATS/MQTT)

| 传输 | 特点 | 选型 |
|---|---|---|
| `Transport.TCP` | 内置、零依赖、request/reply | 服务数少、试验阶段 |
| `Transport.REDIS` | 基于 pub/sub，轻量 | 消息量中等、已用 Redis |
| `Transport.NATS` | 高吞吐、主题灵活 | 中等规模、Golang 混合栈 |
| `Transport.KAFKA` | 持久化、可重放、分区 | 事件流、审计、大数据 |
| `Transport.MQTT` | 物联网友好 | IoT 场景 |
| `Transport.GRPC` | 强类型(proto)、高性能 | 服务间契约明确的内部调用 |

> 由于业务层已经通过 `ClientsModule` + `ClientProxyFactoryService` 抽象，
> **切换传输只需改 `main.ts` 与 `ClientsModule` 配置**，业务代码不动。

---

## 5. 生产关键点

### 5.1 超时

```ts
import { timeout, firstValueFrom } from 'rxjs';
firstValueFrom(client.send(p, d).pipe(timeout(5000)));
```

### 5.2 重试与幂等

- 网络抖动重试(指数退避)应放在 `ClientProxyFactoryService` 里做;
- 但**业务重试必须以幂等为前提**——例如用 `orderId` 做幂等键，重复创建返回同一结果。
- 事件消费方也要幂等(记录已处理的事件 id)。

### 5.3 链路透传(分布式追踪)

把 `requestId` 放进 `meta` 每次透传，配合 `AsyncLocalStorage`(见 `utils/request-context.ts`)
让整条调用链共享同一 id，日志可按它聚合。

### 5.4 错误传播

服务内抛 `RpcException({ code, message })` → 传输层带回调用方 → 网关 `AllExceptionsFilter`
用 `errorCodeToHttpStatus` 映射 HTTP 状态码：

```ts
throw new RpcException({ code: ErrorCode.ORDER_NOT_FOUND, message: '订单不存在' });
```

### 5.5 混合应用(Hybrid)

一个进程同时暴露 HTTP 与监听微服务：

```ts
const app = await NestFactory.create(AppModule);
app.connectMicroservice<MicroserviceOptions>({ transport: Transport.REDIS, options: {...} });
await app.startAllMicroservices();
await app.listen(3000);
```

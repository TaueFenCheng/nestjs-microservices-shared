# 05 · NestJS 高级特性全景清单

> 与"抽离公共模块"配套的 NestJS 高级特性速查。每个特性给出要点、示例片段与适用场景。
> 示例代码中已落地其中大部分(见 README 第六节)。

---

## 1. 装饰器体系

### 1.1 元数据装饰器: `@SetMetadata`

```ts
// 自定义装饰器
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
// 使用
@Roles('admin')
@Get('x') ...
```

配 `Reflector` 在守卫里读取(见下)。

### 1.2 参数装饰器: `createParamDecorator`

```ts
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    return data ? req.user?.[data] : req.user;
  },
);
```

### 1.3 组合装饰器: `applyDecorators`(Nest 8+)

```ts
export const PublicRead = () => applyDecorators(Public(), AllowRoles('viewer'));
```

---

## 2. 守卫 (Guards) / 拦截器 (Interceptors) / 管道 (Pipes) / 过滤器 (Filters)

四者统称"横切关注点"，是把公共逻辑放进共享库的理想载体。

| 组件 | 职责 | 触发时机 |
|---|---|---|
| 守卫 Guard | 鉴权/授权，返回布尔 | 路由处理前 |
| 拦截器 Interceptor | 日志、响应转换、缓存、耗时 | 请求处理前后 |
| 管道 Pipe | 数据转换与校验 | 进入 handler 前 |
| 异常过滤器 Filter | 统一异常输出 | 异常抛出时 |

### 2.1 全局注册的两种方式

```ts
// 方式 A:main.ts(适用于过滤器/管道/拦截器)
app.useGlobalPipes(new SharedValidationPipe());
app.useGlobalFilters(new AllExceptionsFilter());

// 方式 B:依赖注入注册守卫/拦截器为 provider(可注入依赖)
providers: [
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
]
```

> 方式 B 更推荐给守卫/拦截器，因为可以通过 DI 拿到其他 provider。

### 2.2 `ExecutionContext` 与 `Reflector`

```ts
// 守卫里读取路由与类上的元数据(支持继承合并)
const roles = this.reflector.getAllAndOverride('roles', [
  context.getHandler(),
  context.getClass(),
]);
// 切换协议
const http = context.switchToHttp();           // HTTP
// context.switchToRpc(); context.switchToWs();
```

---

## 3. 依赖注入进阶

### 3.1 `ModuleRef` —— 运行时按需解析

```ts
@Injectable()
export class CatsService implements OnModuleInit {
  private transient: TransientService;
  constructor(private moduleRef: ModuleRef) {}
  async onModuleInit() {
    this.transient = await this.moduleRef.resolve(TransientService); // 懒加载/解析
  }
}
```

### 3.2 可选依赖 `@Optional`

```ts
constructor(@Optional() @Inject('REDIS_CLIENT') private redis?: RedisClient) {}
```

### 3.3 作用域与 `moduleRef.registerRequestByContextId`

用于 REQUEST 作用域手动创建子 DI 树(如多租户/测试)。

---

## 4. 生命周期钩子

| 接口 | 时机 |
|---|---|
| `OnModuleInit` | 模块依赖解析后 |
| `OnApplicationBootstrap` | 全部模块初始化完毕 |
| `OnModuleDestroy` / `BeforeApplicationShutdown` / `OnApplicationShutdown` | 关闭阶段(优雅下线) |

```ts
export class DatabaseService implements OnApplicationShutdown {
  async onApplicationShutdown(signal?: string) {
    await this.pool.end(); // 优雅关闭连接池
  }
}
```

**意义**:微服务需要"先摘流,再处理完在途请求,最后关连接"，钩子是注入点。

---

## 5. 配置与策略

### 5.1 `@nestjs/config`

```ts
ConfigModule.forRoot({ isGlobal: true, load: [configuration] });
// 动态模块 forRootAsync + ConfigService 配合(见 docs/03)
```

### 5.2 自定义验证器/管道、序列化(interceptor 中用 class-transformer)

```ts
@UseInterceptors(ClassSerializerInterceptor)   // 配合 @Exclude 隐藏敏感字段
```

---

## 6. 微服务与分布式相关

| 能力 | 包 | 要点 |
|---|---|---|
| 多传输微服务 | `@nestjs/microservices` | TCP/Redis/Kafka/NATS/MQTT/gRPC |
| 自定义传输器 | 继承 `Server`/`ClientProxy` | 接入私有协议 |
| 混合应用 | — | HTTP + 微服务同进程 |
| 健康检查 | `@nestjs/terminus` | 供 K8s/注册中心探活 |
| 定时任务 | `@nestjs/schedule` | `@Cron` / `@Interval` / `@Timeout` |
| 事件总线(进程内) | `@nestjs/event-emitter` | `@OnEvent('order.created')` |
| 缓存 | `@nestjs/cache-manager` | `@UseInterceptors(CacheInterceptor)` |
| CQRS | `@nestjs/cqrs` | Command/Query/Event |
| 网关/编排 | `@nestjs/graphql`、`@nestjs/websockets` | 视需求 |

---

## 7. 可观测性

- **日志**:统一 `LoggerService`(示例已做)，生产接 pino/winston → ELK/Loki；
- **追踪**:接 OpenTelemetry，`AsyncLocalStorage` 已为 requestId 打底；
- **指标**:`@nestjs/terminus` 之外可加 prom-client 暴露 `/metrics`。

---

## 8. 测试与类型安全

- **单元测试**:Jest + 独立实例化 provider；
- **e2e**:`Test.createTestingModule` 覆盖 REST + 微服务消息；
- **类型安全**:`strict` 模式 + 共享 DTO + `as const` 常量表。

---

## 9. 何时用哪个(速查表)

| 想做的事 | 用什么 |
|---|---|
| 统一鉴权/授权 | Guard(`JwtAuthGuard` / `RolesGuard`) |
| 统一响应格式/日志/链路 | 拦截器 |
| 统一入参校验 | 管道 + 共享 DTO |
| 统一异常输出 | 过滤器 |
| 跨服务调用不感知传输 | `ClientsModule` + `ClientProxyFactoryService` |
| 服务间异步解耦 | 事件(`@EventPattern` / event-emitter / 消息队列) |
| 每服务不同配置的一套公共代码 | 动态模块 `forRoot/forFeature` |

# 03 · 模块机制深度(抽离公共模块的理论基础)

> NestJS 的"模块+依赖注入"机制是公共模块能跨服务复用的底层保证。
> 本文件讲清 5 个核心概念,每一个都在示例里落地。

---

## 1. `exports` —— 共享的地基

NestJS 的模块**默认是单例**:每个 provider 在应用内只有一个实例。
但要把这个实例"给别的模块用",必须 `exports` 出去。

```ts
@Module({
  providers: [CatsService],        // 本模块可注入
  exports: [CatsService],          // 导入本模块的模块也可注入(同一实例)
})
export class CatsModule {}
```

> 理解:**exports 决定"可见性",单例决定"身份"**。多个服务各自 `imports` 同一
> 全局模块,拿到的是同一个实例 —— 这就是"共享"的来源。

---

## 2. `@Global()` —— 基础设施免导入

被 `@Global()` 标记的模块,其 `exports` 对**整个应用**可见,无需在每个模块 import。

```ts
@Global()
@Module({ providers: [LoggerService], exports: [LoggerService] })
export class LoggerModule {}
// 任何地方: constructor(private logger: LoggerService) {}
```

**使用边界**:只对真正"到处都要"的基础设施用(日志/配置/鉴权)。
业务模块滥用全局会导致依赖不明、难以测试。

> 注意:`@Global()` + 动态模块时,`forRoot` 返回对象里要写 `global: true`
> (Nest 不自动合并装饰器与运行时返回值),见下方动态模块。

---

## 3. 动态模块(`DynamicModule`)—— 每服务一配置,一套代码

这是**微服务复用公共模块的核心**。同一个公共模块,通过静态方法返回配置化的
`DynamicModule`,每个服务传入自己的参数。

```ts
// 定义
@Module({})
export class DatabaseModule {
  static forRoot(options: DatabaseOptions): DynamicModule {
    return {
      module: DatabaseModule,
      global: true,               // 运行时声明全局
      providers: [
        { provide: 'DATABASE_OPTIONS', useValue: options },
        { provide: 'DATABASE_CONNECTION', useFactory: (o) => create(o), inject: ['DATABASE_OPTIONS'] },
        DatabaseService,
      ],
      exports: [DatabaseService],
    };
  }
}

// 使用:两个服务拿不同配置
SharedModule.forRoot({ database: { type: 'memory' } })           // orders
SharedModule.forRoot({ database: { type: 'postgres', host } })   // billing
```

### 常见方法命名约定

| 方法 | 语义 |
|---|---|
| `register()` | 常规注册(可能被多次调用) |
| `forRoot()` / `forRootAsync()` | 应用级只初始化一次(通常全局) |
| `forFeature()` | 按功能/实体扩展 |

### 异步版(`forRootAsync`)

当配置来自 `ConfigModule`(需要异步读取)时使用注入式工厂:

```ts
static forRootAsync(options: {
  useFactory: (...args: unknown[]) => DatabaseOptions | Promise<DatabaseOptions>;
  inject?: unknown[];
}): DynamicModule {
  return { module: X, providers: [{
    provide: 'DATABASE_OPTIONS',
    useFactory: options.useFactory,
    inject: options.inject,
  }, ...] };
}

// 使用
DatabaseModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    host: config.get('DB_HOST'),
    port: config.get<number>('DB_PORT'),
  }),
})
```

---

## 4. 自定义 provider(provider 的四种形态)

Nest 允许把「类」之外的任何东西注册为 provider,让公共层注入的"能力"更灵活:

```ts
@Module({
  providers: [
    // useClass —— 指定实现类(可换实现)
    { provide: CacheService, useClass: RedisCacheService },
    // useValue —— 注入字面量/实例
    { provide: 'APP_NAME', useValue: 'orders' },
    // useFactory —— 工厂函数(可异步、可依赖其他 provider)
    { provide: 'REDIS_CLIENT', useFactory: (cfg) => new Redis(cfg), inject: ['DB_OPTIONS'] },
    // useExisting —— 别名,指向已有 provider
    { provide: 'BillingClient', useExisting: SomeClient },
  ],
})
export class DemoModule {}
```

在共享库中,`useValue`(配置)、`useFactory`(连接/客户端)、`useClass`(可插拔实现)
用得最多;配合 `TOKENS`(Symbol 常量)避免魔法字符串。

---

## 5. 聚合模块 —— `SharedModule.forRoot` 一行接入

把散落的公共模块编排进一个 `SharedModule`,对外只暴露一个 `forRoot`:

```ts
@Global()
@Module({})
export class SharedModule {
  static forRoot(options: SharedModuleOptions): DynamicModule {
    const imports = [LoggerModule.forRoot({ appName: options.appName }), HealthModule];
    if (options.database) imports.push(DatabaseModule.forRoot(options.database));
    if (options.auth) imports.push(AuthModule.forRoot(options.auth));
    return { module: SharedModule, global: true, imports, exports: imports };
  }
}
```

**收益**:微服务根模块从"几十行样板"收敛到:

```ts
@Module({
  imports: [SharedModule.forRoot({ appName: 'orders', database: {...}, auth: {...} })],
})
export class AppModule {}
```

这就是"抽离公共模块"的**最终形态**:接入方几乎零样板代码。

---

## 6. 依赖注入与作用域(进阶)

| 作用域 | 说明 | 场景 |
|---|---|---|
| `Scope.DEFAULT`(单例) | 应用级一个实例 | 默认;无状态服务、连接池 |
| `Scope.REQUEST` | 每个请求一个实例 | 需按请求隔离状态(多租户) |
| `Scope.TRANSIENT` | 每次注入独立实例 | 每次都要全新实例的工具类 |

注意:REQUEST 作用域 provider 会向上传播(依赖它的 provider 也变 REQUEST),
对性能有影响,按需使用。配合 `ModuleRef.resolve()` 可动态解析
(见 `docs/05` 的 ModuleRef)。

---

## 7. 小结

| 机制 | 解决什么 | 对应示例 |
|---|---|---|
| `exports` | 跨模块共享单例 | `SharedModule` |
| `@Global()` | 基础设施免导入 | `LoggerModule` |
| 动态模块 | 一套代码多配置 | `DatabaseModule.forRoot` |
| 自定义 provider | 注入连接/配置/可插拔实现 | `ClientsModule`、`DatabaseModule` |
| 聚合模块 | 一行接入 | `SharedModule.forRoot` |

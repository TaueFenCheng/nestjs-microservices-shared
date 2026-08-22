# 07 · 生命周期钩子(启动有序 · 关闭优雅)

> NestJS 的模块/应用生命周期可以概括为八个字:**启动有序、关闭优雅**。
> 框架在应用启动与关闭的特定时间点,回调那些实现了生命周期接口(interface)的
> 类实例,让你有机会在正确时机做初始化或清理。
>
> 本仓库示例:`apps/orders/.../orders.service.ts` 的 `OnModuleInit`
> 与 `libs/shared/.../database.service.ts` 的 `OnApplicationShutdown`。

---

## 1. 重要前提:钩子挂在 Provider 实例上

生命周期钩子**不是挂在模块类上**,而是挂在**注入容器里的实例**(Service /
Controller / 自定义 Provider)上。想被回调,必须满足两点:

1. 类实现了对应的接口(如 `implements OnModuleInit`);
2. 该类被注册进某个 `@Module()` 的 `providers`(或 controllers)中,
   由注入容器管理。

> 坑:`new` 出来的普通对象不会被生命周期管理,钩子不会执行。

---

## 2. 六个核心钩子一览

| 阶段 | 接口 | 方法 | 典型用途 |
|---|---|---|---|
| 启动 | `OnModuleInit` | `onModuleInit()` | 建表、加载种子数据、初始化订阅 |
| 启动 | `OnApplicationBootstrap` | `onApplicationBootstrap()` | 等所有模块初始化完再启动服务 |
| 关闭 | `OnModuleDestroy` | `onModuleDestroy()` | 每个模块各自的清理 |
| 关闭 | `BeforeApplicationShutdown` | `beforeApplicationShutdown(signal?)` | 收到关闭信号后的收尾准备 |
| 关闭 | `OnApplicationShutdown` | `onApplicationShutdown(signal?)` | 关连接池、断 Redis、发最后的消息 |

其中 `signal` 参数能拿到触发关闭的信号(`SIGTERM` / `SIGINT` 等)。

---

## 3. 启动顺序:依赖先就绪,钩子后触发

启动流程:解析依赖图 → 递归实例化所有 provider → 再按序触发钩子。

```
1. 先初始化"被导入的模块"(依赖先就绪)
2. onModuleInit()        —— 单个模块依赖就绪后,逐个执行
3. onApplicationBootstrap() —— 所有模块 init 完成后,最后统一执行
```

### 关键理解:`onModuleInit` ≠ 「模块一加载就调用」

`onModuleInit` 是**「该模块的所有依赖都创建完毕后才调用」**。所以钩子内可以
放心使用注入的依赖——这是它与构造函数 DI 的本质区别:

- **构造函数**:对象刚创建,依赖树尚未完全就绪;
- **onModuleInit**:执行时依赖图已经就绪。

### `onApplicationBootstrap` 的特殊地位

它是**全局最后一步**,保证前面所有模块的 `onModuleInit` 都已完成,适合做
「整个应用就绪后才该做的事」(如启动定时任务、接通下游、广播就绪)。

### 仓库实际顺序(依赖导入关系决定)

```
libs/shared(被导入,先初始化)
  └─ DatabaseService.onModuleInit?
apps/orders / apps/billing / apps/gateway(后初始化)
  └─ OrdersService.onModuleInit
最后:各 app 的 onApplicationBootstrap
```

---

## 4. 关闭顺序:严格逆序(后初始化的先清理)

关闭阶段钩子**按初始化的逆序执行**:依赖者先退出,底层资源最后关闭。

```
onModuleDestroy()                → 每个模块逐一清理(逆序)
beforeApplicationShutdown(signal) → 所有模块收尾准备
onApplicationShutdown(signal)    → 关闭 DB 连接池 / Redis / 发送最后消息
```

应用默认会等待这些异步钩子返回(Promise 完成)才会真正退出进程——
这正是「优雅关闭」的保障。

---

## 5. 本仓库中的落地示例

### 启动端:预置初始化数据

```ts
// apps/orders/src/orders/orders.service.ts
@Injectable()
export class OrdersService implements OnModuleInit {
  private readonly store = new Map<string, Order>();

  async onModuleInit() {
    // 生命周期钩子:启动时初始化(真实场景:建表、预置数据)
  }
}
```

### 关闭端:释放数据库连接

```ts
// libs/shared/src/modules/database/database.service.ts
@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  async onApplicationShutdown(signal?: string) {
    // 优雅关闭:生产环境这里应关闭 DataSource / Pool / PrismaClient
  }
}
```

### 完整生命周期(伪代码演示)

```ts
@Injectable()
export class MyService
  implements
    OnModuleInit,
    OnApplicationBootstrap,
    OnModuleDestroy,
    BeforeApplicationShutdown,
    OnApplicationShutdown
{
  async onModuleInit() {
    console.log('1. 依赖就绪,初始化本模块资源');
  }

  async onApplicationBootstrap() {
    console.log('2. 整个应用就绪,此时才对外提供服务');
  }

  async onModuleDestroy() {
    console.log('3. 开始关闭(逆序):本模块自己的清理');
  }

  async beforeApplicationShutdown(signal?: string) {
    console.log('4. 收到信号', signal, ',停止接收新请求');
  }

  async onApplicationShutdown(signal?: string) {
    console.log('5. 最后:释放连接池等底层资源');
  }
}
```

---

## 6. 容易踩的坑

1. **钩子只对注入容器管理的 provider 生效** —— `new` 出来的对象不会被调用。
2. **异步钩子必须 `await` 或返回 Promise** —— 否则框架不知道你干完没,
   可能提前进入下一阶段。
3. **钩子顺序依赖模块导入关系** —— 想控制顺序,就调整 `imports`,
   而不是指望钩子先执行。
4. **关闭钩子要幂等、可重入** —— 生产环境可能多次触发(如容器反复发信号)。
5. **不要放耗时操作在 `onModuleInit` 里阻塞启动** —— 需要等所有模块就绪的
   事情放 `onApplicationBootstrap`。

---

## 7. 一句话总结

> **`onModuleInit` = 依赖就绪后、正式对外服务前的初始化点;**
> **`onApplicationBootstrap` = 全应用就绪后的开闸放水点;**
> **关闭类钩子 = 逆序执行、释放资源的善后点。**
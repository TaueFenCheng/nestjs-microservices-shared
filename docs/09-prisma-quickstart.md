# 09 · Prisma 速查(PrismaClient 方法 + 事务)与 TypeORM 对照

> 本仓库数据层用 TypeORM;本节面向"同事/项目里用了 Prisma"的场景,
> 讲清 PrismaClient 的全部常用方法、`$transaction` 的两种形态,
> 并给出与仓库现有 TypeORM 写法的对照,方便两套生态切换。

---

## 1. PrismaClient 两大面

```
PrismaClient
 ├── 模型方法(per 模型):user.create / order.findMany / order.count ...
 └── 客户端方法($ 开头):$transaction / $queryRaw / $extends ...
```

### 1.1 `$` 客户端方法清单

| 方法 | 作用 | 示例 |
|---|---|---|
| `$transaction(...)` | 事务(两种形态,见 §2) | `client.$transaction([...])` |
| `$connect()` / `$disconnect()` | 连接池建立 / 断开 | 生命周期钩子中用 |
| `$queryRaw` / `$queryRawUnsafe` | 原生 SQL 读(后者字符串拼接,防注入) | `$queryRaw\`SELECT * FROM orders\`` |
| `$executeRaw` / `$executeRawUnsafe` | 原生 SQL 写(返回影响行数) | `$executeRaw\`DELETE ...\`` |
| `$extends()` | 客户端扩展(查询拦截/模型增强,5.x 推荐) | `$extends({ query: {...} })` |
| `$on()` | 事件钩子(query / error / log) | `$on('query', e => ...)` |
| `$use()` | 旧版中间件(4.x;5.x 用 `$extends`) | — |
| `$metrics()` | engine 性能指标 | `$metrics.json()` |
| `$runCommandRaw()` | MongoDB 原生命令 | — |

### 1.2 模型方法(每张表都有)

```
create / createMany / update / updateMany / upsert
findUnique / findFirst / findMany / count / aggregate / groupBy
delete / deleteMany / findUniqueOrThrow / findFirstOrThrow
```

常用参数:`where / select / include / orderBy / skip / take / distinct`。

---

## 2. `$transaction` 的两种形态(区分关键)

### 2.1 数组式(批量、并发、只读友好)

```ts
const [items, total] = await prisma.$transaction([
  prisma.order.findMany({ skip, take }),
  prisma.order.count({ where }),
]);
// 数组内命令并发执行,要么全成要么全没;元素之间不可互相依赖
```

> 注意:两个查询不保证同一快照(各走各自读),计数与列表高并发下有轻微漂移;
> 要严格一致用交互式 + `RepeatableRead`。

### 2.2 交互式(事务函数,支持依赖与条件写)

```ts
await prisma.$transaction(
  async (tx) => {
    const order = await tx.order.create({ data });
    if (order.status === 'PAID') {
      await tx.payment.create({ data: { orderId: order.id } }); // 必须用 tx!
    }
    // 抛错 => 整体回滚
  },
  { maxWait: 5000, timeout: 10_000, isolationLevel: 'ReadCommitted' },
);
```

> ⚠️ 关键坑:**事务内必须用 `tx`(事务客户端),不要用外层 `prisma`**;
> 外层 client 的命令不参与事务,会造成"自以为在事务里"的脏写。

---

## 3. NestJS 集成惯用封装

```ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  async onModuleInit() { await this.$connect(); }
  async onApplicationShutdown() { await this.$disconnect(); }
}
```

---

## 4. 与仓库现有技术(TypeORM)对照

| 能力 | Prisma | 仓库现状(TypeORM) |
|---|---|---|
| 事务(批量) | `$transaction([q1, q2])` | `dataSource.transaction(async em => ...)` |
| 事务(编排) | 交互式 `$transaction(async tx => ...)` | 同左 + 仓库封装 `@Transactional()` 装饰器 |
| 原生 SQL 读 | `$queryRaw` | `queryRunner.query(sql)` |
| 查询拦截/扩展 | `$extends({ query })` | `@TenantScoped` 装饰器 / QueryBuilder 钩子(规划中) |
| 查询日志 | `$on('query', ...)` | TypeORM `logging: ['query']` |
| 连接生命周期 | `$connect` / `$disconnect` 手动 | DataSource 自动 + `onModuleInit/onApplicationShutdown` |
| 悲观锁 | `$queryRaw\`SELECT ... FOR UPDATE\`` | 同左(SQL) |
| 乐观锁 | 手动 `version` where 条件 | 仓库 `OrderEntity.version` + 显式 WHERE version(见 §5 注释) |

---

## 5. 常见坑速记

1. **事务内用 tx 不用 client**(最容易犯的错误);
2. **原生 SQL 只走 `$queryRaw/executeRaw` 的绑定参数版**,`Unsafe` 均 danger;
3. **事务默认 `ReadCommitted`**;对账/统计要 `RepeatableRead`;时序敏感要 `Serializable`;
4. **N+1**:`include/select` 解决,不要循环里逐条 `findMany`;
5. **`$extends` 做全局软删/租户过滤**(对标 TenantScoped 思路,见 §4);
6. **长事务**:`timeout` 必设,事务内不写日志/调外部 RPC(锁占用时间 = 风险窗口)。

---

> 一句话:Prisma 的 `$` 方法 = 客户端级能力(事务/原生 SQL/扩展/钩子),
> 不带 `$` 的是模型 CRUD;事务优先交互式(`tx`),批量计数用数组式但接受轻微漂移。
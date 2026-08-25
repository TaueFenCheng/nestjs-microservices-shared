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

### 1.3 查询方法 —— 每个方法的可运行示例

> 示例基于如下 schema(`model PrismaOrder` → delegate `client.prismaOrder`):
> ```prisma
> model PrismaOrder {
>   id          String   @id @default(uuid())
>   userId      String
>   status      String   @default("PENDING")
>   totalAmount Float
>   remark      String?
>   createdAt   DateTime @default(now())
>   updatedAt   DateTime @updatedAt
>   @@map("orders")
> }
> ```

```ts
// findUnique:按主键/@unique 取一条,查不到返回 null
const order = await this.prisma.client.prismaOrder.findUnique({
  where: { id: 'o-1' },
});
if (!order) throw new NotFoundException('订单不存在');

// findUniqueOrThrow:查不到直接抛 PrismaClientKnownRequestError(P2025)
const order = await this.prisma.client.prismaOrder.findUniqueOrThrow({
  where: { id: 'o-1' },
});

// findFirst:取符合条件的第一条(可带排序,如"取最早一笔 PENDING")
const oldestPending = await this.prisma.client.prismaOrder.findFirst({
  where: { status: 'PENDING' },
  orderBy: { createdAt: 'asc' },
});

// findFirstOrThrow:空则抛错
const order = await this.prisma.client.prismaOrder.findFirstOrThrow({
  where: { userId: 'u-1' },
});

// findMany:分页 + 排序 + 白名单字段 + 多条件筛选(典型列表页)
const [items, total] = await this.prisma.client.$transaction([
  this.prisma.client.prismaOrder.findMany({
    where: { userId: 'u-1', status: { in: ['PENDING', 'PAID'] } },
    select: { id: true, totalAmount: true, status: true }, // 只要 3 个字段
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  }),
  this.prisma.client.prismaOrder.count({ where: { userId: 'u-1' } }),
]);

// 游标分页(cursor):替代 skip 深分页,大表推荐
const nextPage = await this.prisma.client.prismaOrder.findMany({
  take: 10, skip: 1, cursor: { id: lastSeenId }, orderBy: { id: 'asc' },
});

// count:直接计数
const pendingCount = await this.prisma.client.prismaOrder.count({
  where: { status: 'PENDING' },
});

// count + select:一次算多个口径
const counts = await this.prisma.client.prismaOrder.count({
  select: {
    pending: { where: { status: 'PENDING' } },
    paid:    { where: { status: 'PAID' } },
    all:     true,
  },
}); // { pending: 3, paid: 10, all: 15 }

// aggregate:数值聚合(总额/均值/最新时间)
const agg = await this.prisma.client.prismaOrder.aggregate({
  _sum: { totalAmount: true },
  _avg: { totalAmount: true },
  _max: { createdAt: true },
  _count: true,
});

// groupBy:按状态分组 + having 过滤
const byStatus = await this.prisma.client.prismaOrder.groupBy({
  by: ['status'],
  _count: { _all: true },
  _sum:   { totalAmount: true },
  having: { totalAmount: { _avg: { gte: 100 } } },
});
// [{ status: 'PAID', _count: { _all: 10 }, _sum: { totalAmount: 10000 } }, ...]
```

### 1.4 写方法 —— 每个方法的可运行示例

```ts
// create:插入一行,返回整行(含默认值字段)
const order = await this.prisma.client.prismaOrder.create({
  data: { id: randomUUID(), userId: 'u-1', totalAmount: 100, status: 'PENDING' },
});

// createMany:批量插入(不返回记录、不触发字段级钩子)注意 createMany 默认跳过 @updatedAt
const { count } = await this.prisma.client.prismaOrder.createMany({
  data: [{ userId: 'u-1', totalAmount: 10 }, { userId: 'u-2', totalAmount: 20 }],
});

// createManyAndReturn:批量插入并返回记录(5.x+)
const orders = await this.prisma.client.prismaOrder.createManyAndReturn({
  data: [{ userId: 'u-1', totalAmount: 10 }],
});

// update:更新一行(where 必须唯一条件)
const order = await this.prisma.client.prismaOrder.update({
  where: { id: 'o-1' },
  data: { status: 'PAID' },
});

// updateMany:条件批量更新,返回 { count }
const { count } = await this.prisma.client.prismaOrder.updateMany({
  where: { userId: 'u-1', status: 'PENDING' },
  data: { remark: '批量备注' },
});

// upsert:有则更新、无则插入(原子,防重复下单常用)
const order = await this.prisma.client.prismaOrder.upsert({
  where: { id: 'o-1' },
  create: { id: 'o-1', userId: 'u-1', totalAmount: 100 },
  update: { status: 'PAID' },
});

// delete:删一行(where 唯一条件),返回被删整行
const deleted = await this.prisma.client.prismaOrder.delete({
  where: { id: 'o-1' },
});

// deleteMany:批量删除
const { count } = await this.prisma.client.prismaOrder.deleteMany({
  where: { userId: 'u-1', status: 'CANCELLED' },
});
```

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
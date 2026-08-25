# 10 · Prisma 关联查询与索引优化

> 承接 `09-prisma-quickstart.md`(方法/事务基础),本篇讲两件事:
> ① 多表/关联查询怎么用 Prisma 处理(include/select/中间表/原生 JOIN);
> ② 怎么加索引让查询变快(@@index/EXPLAIN/坑)。
> 每节附与仓库 TypeORM 的对照。

---

## 0. 示例 schema(全文共用)

```prisma
model PrismaOrder {
  id        String        @id @default(uuid())
  userId    String
  status    String
  totalAmount Float
  customerId String?
  customer  PrismaCustomer? @relation(fields: [customerId], references: [id])
  items     PrismaOrderItem[]
  @@map("orders")
}

model PrismaOrderItem {
  id      String      @id @default(uuid())
  orderId String
  order   PrismaOrder @relation(fields: [orderId], references: [id])
  sku     String
  quantity Int
  @@map("order_items")
}

model PrismaCustomer {
  id     String        @id @default(uuid())
  name   String
  orders PrismaOrder[]
  @@map("customers")
}
```

关系三形态:一对一(两边 `@unique`)、一对多(数组 + 外键)、多对多(§1.4)。

---

## 1. 关联查询

### 1.0 多表查询(JOIN)总览 —— 先建立“表语义”这层认知

多表查询的三种关系语义与 SQL JOIN 的对应(面试先答这个):

| 业务语义 | SQL | Prisma 写法 | 注意 |
|---|---|---|---|
| 订单→客户(多对一) | `LEFT JOIN customers` | `include: { customer: true }` | 取不到客户时 customer 为 `null` |
| 订单→明细(一对多) | `LEFT JOIN order_items` | `include: { items: true }` | 拿不到明细时 items 为 `[]` |
| 只返回“存在某明细”的订单(跨表过滤) | `INNER JOIN ... ON ...` | `where: { items: { some: {...} } }` | **Prisma 里“inner join 语义”的写法** |
| 三表串联(订单-明细-商品) | 连续 JOIN | `include: { items: { include: { product: true } } }` | 深度 ≤ 2,见 §1.6 |
| 跨表排序 | `ORDER BY customers.name` | `orderBy: { customer: { name: 'asc' } }` | 关系字段排序 |

#### 跨表过滤三兄弟(some / every / none)——对应 SQL 半连接

```ts
// some:至少有一条匹配明细 => 等价 INNER JOIN + DISTINCT
const orders = await client.prismaOrder.findMany({
  where: { items: { some: { sku: 'SKU-A' } } },
});

// every:所有明细都满足
const orders = await client.prismaOrder.findMany({
  where: { items: { every: { quantity: { gte: 1 } } } },
});

// none:没有任何匹配明细(对应 NOT EXISTS / LEFT JOIN ... IS NULL)
const orders = await client.prismaOrder.findMany({
  where: { items: { none: { status: 'CANCELLED' } } },
});
```

#### 多表分页与笛卡尔膨胀的坑

- Prisma 的 `include` 底层是**分批查询**(主表 LIMIT 分页 + 关联批量拾取),
  **不会像手写 `LEFT JOIN` 那样因一对多把行数放大**——
  `findMany({ take: 10, include: { items: true } })` 返回 10 条订单+各自明细,总数不膨胀;
- 但**手写 JOIN(如 `$queryRaw`)分页要小心**:一对多 JOIN + LIMIT 切在“行”上,
  明细会被截断;常规解是先分主子表再合并,或 `DISTINCT ON` / 子查询;
- 多表计数口径别混:`count({ where: { items: { some: {} } } })` 是“订单数”,
  “明细行数”是另一个口径。

#### 跨表聚合(按关联表字段分组时,Prisma 上不来)

```ts
// groupBy 不能 by 关联实体的字段(如按客户 name 分组)——编译器直接拒绝:
// client.prismaOrder.groupBy({ by: ['customer.name'] })   ❌
// 这类需求回到 $queryRaw:
const rows = await client.$queryRaw`
  SELECT c.name, COUNT(o.id) AS order_count, SUM(o.total_amount) AS amount
  FROM orders o
  JOIN customers c ON c.id = o.customer_id
  GROUP BY c.name
  ORDER BY amount DESC
`;
```

#### 三表串联的推荐写法(嵌套 include)

```ts
// 订单 -> 明细 -> 商品(两层 include,等效“多表 join”的结果形态)
const orders = await client.prismaOrder.findMany({
  where: { status: 'PAID' },
  include: {
    customer: true,
    items: {
      include: { product: true },      // 第二层
      orderBy: { id: 'asc' },
    },
  },
});
```

> 多表查询选型口诀:**“实体+其关联” → `include/select`;“跨表过滤/存在性” →
> `where: 关联(some/every/none)`;“多维报表/任意 JOIN/按关联字段分组” → `$queryRaw`。**

### 1.1 `include`:一条语句把关联表一起查出来

```ts
const order = await client.prismaOrder.findUnique({
  where: { id: 'o-1' },
  include: {
    items: true,      // 订单 -> 条目(一对多)
    customer: true,   // 订单 -> 客户(一对一)
  },
});
// order.items => PrismaOrderItem[];order.customer => PrismaCustomer | null
```

### 1.2 `select`:只挑字段(含嵌套关联字段)

```ts
const order = await client.prismaOrder.findMany({
  where: { status: 'PAID' },
  select: {
    id: true,
    totalAmount: true,
    customer: { select: { id: true, name: true } }, // 嵌套选择
    items: { select: { sku: true, quantity: true } },
    _count: { select: { items: true } },            // 只要关联数量,不加载明细
  },
});
```

> ⚠️ `include` 与 `select` **不能在同一次查询混用**(语法限制):要白名单用 `select`,
> 要整行带关联用 `include`。

### 1.3 关联过滤 / 排序 / 分页

```ts
// 按关联条件过滤:查"有已支付订单的客户"(some / every / none 三种谓词)
const customers = await client.prismaCustomer.findMany({
  where: { orders: { some: { status: 'PAID' } } },
});

// 对关联本身筛选 + 排序 + 限量(只取数量>1 的最近 2 条条目)
const order = await client.prismaOrder.findUnique({
  where: { id: 'o-1' },
  include: {
    items: { where: { quantity: { gt: 1 } }, orderBy: { id: 'desc' }, take: 2 },
  },
});

// 按关联字段排序:按客户名排序订单
const orders = await client.prismaOrder.findMany({
  orderBy: { customer: { name: 'asc' } },
});
```

### 1.4 多对多(显式中间表,可带额外字段)

```prisma
model Post { id String @id; tags PostTag[] }
model Tag  { id String @id; posts PostTag[] }

model PostTag {          // 中间表:Prisma 也会自动建"隐式 M:N"表,隐式不能带字段
  postId String
  tagId  String
  @@id([postId, tagId])
}
```

```ts
const post = await client.post.findMany({
  include: { tags: { include: { tag: true } } }, // 中间表再带出目标实体
});
```

### 1.5 复杂 JOIN / 聚合:回到 `$queryRaw`

Prisma 不适合"任意 JOIN + 复杂聚合"时用原生 SQL(如跨多层的报表):

```ts
const rows = await client.$queryRaw`
  SELECT o.user_id AS uid, c.name,
         SUM(i.quantity * i.price) AS amount
  FROM orders o
  JOIN order_items i ON i.order_id = o.id
  LEFT JOIN customers c ON c.id = o.customer_id
  WHERE o.status = ${status}
  GROUP BY o.user_id, c.name
  HAVING SUM(i.quantity * i.price) > ${min}
`;
// 一律用 $queryRaw(绑定参数),不要用 $queryRawUnsafe 拼串
```

### 1.6 关联查询的性能与坑

| 问题 | 对策 |
|---|---|
| N+1(循环里逐条查关联) | 一次 `include/select`,绝不循环查 |
| include 过深(多层嵌套) | 每层多一次数据库往返,控制深度 ≤ 2 |
| 大表关联全量加载 | 关联上加 `where/take` 限制,或用 `_count` 只要数量 |
| 隐式 M:N 中间表不可控 | 建显式中间 model(还能加字段) |
| 事务内关联写 | `tx.order.create` + `tx.orderItem.createMany`,全部用 `tx` |

---

## 2. 索引与查询优化

### 2.1 schema 声明索引(建索引唯一入口)

```prisma
model PrismaOrder {
  id             String   @id @default(uuid())
  userId         String
  status         String
  tenantId       String
  createdAt      DateTime @default(now())
  idempotencyKey String   @unique      // 唯一约束 => 自动唯一索引(幂等去重核心)
  remark         String?

  @@index([userId])                                        // 单列
  @@index([tenantId, status])                              // 联合(最左前缀)
  @@index([createdAt(sort: Desc)])                         // 排序方向索引
  @@index([userId, status], map: "idx_orders_user_status") // 命名(便于运维/迁移管理)
  @@index([status], where: "status = 'PAID'")              // 部分索引(PG):只索引 PAID 行
  @@index([userId, createdAt])                             // 用户时间线查询

  @@map("orders")
}
```

之后 `npx prisma migrate dev --name add_orders_indexes` 生成建索引迁移。

### 2.2 什么查询走索引

| 查询写法 | 命中的索引 |
|---|---|
| `where: { userId }` | `@@index([userId])` |
| `where: { tenantId, status }`(整列) | `@@index([tenantId, status])` |
| `where: { tenantId }`(只用首列) | 同上(最左前缀) |
| `orderBy: { createdAt: 'desc' }` | `@@index([createdAt(sort: Desc)])` |
| 只查索引列 | **Index Only Scan**(不回表,最快) |
| `@@unique` 字段 | 唯一索引(等值/去重) |

### 2.3 怎么判断该不该加、加哪个

```ts
// Prisma 不暴露 query planner,用 $queryRaw 看执行计划:
const plan = await client.$queryRaw`
  EXPLAIN ANALYZE
  SELECT * FROM orders WHERE user_id = 'u-1' ORDER BY created_at DESC LIMIT 20
`;
// 看 type:
//   Seq Scan(全表扫)          -> 该加索引
//   Index Scan / Index Only Scan -> 已走索引
```

**判断口诀**:
- where / orderBy / join 上出现的列 → 该有索引;
- 常一起查的多列 → **联合索引**(等值列放前、范围/排序列放后);
- 排序方向与索引一致(所以 `(sort: Desc)` 有用);
- 生产:看 `pg_stat_statements` 高频慢 SQL,优先优化。

### 2.4 索引十大坑

1. **`LIKE '%xxx%'` 前置通配不走索引**(PG 可加 `pg_trgm` GIN);
2. **函数包裹列不走索引**:`WHERE date(created_at) = ...` → 改范围 `created_at >= x AND created_at < x+1`;
3. **隐式类型转换不走索引**:字符串列传数字对齐类型;
4. **低基数列单列索引收益低**:`status` 只有几个值,要和 `tenantId` 联合才有意义;
5. **索引过多拖慢写入**:每次 insert/update 都维护索引,写多表宁精勿多;
6. **联合索引吃最左前缀**:`[tenantId, status]` 救不了 `status` 单独查;
7. **排序方向要匹配**:`desc` 查配 `asc` 索引会反向扫描(能走但略差);
8. **索引列越小越好**:优先 int/uuid,超长 text 用 hash/前缀;
9. **外键索引不用手动**:Prisma 对 `@relation` 外键自动建索引;
10. **线上加索引注意锁**:大表 `CREATE INDEX CONCURRENTLY`(手写 SQL 放进迁移)。

---

## 3. 与仓库 TypeORM 的对照

| 能力 | Prisma | 仓库(TypeORM) |
|---|---|---|
| 加载关联 | `include: { items: true }` | `relations: { items: true }` / `find({ relations })` |
| 白名单+关联 | `select` 嵌套 | `select + relations` 或 QueryBuilder |
| 关联过滤 | `where: { items: { some: {} } }` | `innerJoinAndSelect` + `andWhere` |
| 关联计数 | `_count` | `loadRelationCountAndMap` |
| 复杂聚合 | `$queryRaw` | `QueryBuilder.leftJoin + select SUM` |
| 多对多 | 中间 `model`(或隐式表) | `@ManyToMany` + `@JoinTable` |
| 单列索引 | `@@index([a])` | `@Index()` |
| 联合索引 | `@@index([a, b])` | `@Index(['a', 'b'])` |
| 唯一索引 | `@unique` / `@@unique` | `@Unique([...])` |
| 自定义名/部分索引 | `map` / `where` | SQL migration 手写 |
| 排序索引 | `(sort: Desc)` | `@Index` 方向配置(有限支持) |

---

## 4. 一句话

> 关联查询 = 建模声明关系 + `include/select` 自动 JOIN(N+1 是红线);
> 查询提速 = `@@index` 声明 + `EXPLAIN ANALYZE` 验证(Seq Scan → Index Scan 才算数)。
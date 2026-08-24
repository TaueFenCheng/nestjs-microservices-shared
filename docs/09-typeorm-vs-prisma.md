# TypeORM vs Prisma:两套 ORM 的实战对照

> 本仓库是少见的"同一业务、两套 ORM"教学工程:
> **TypeORM 0.3**(主线,orders 微服务的正式实现)+ **Prisma 7**(对照演示,
> 独立 schema/表/接口,互不干扰)。本文档完整记录两条路线怎么选、怎么接、各自坑在哪。

---

## 一、为什么这个仓库两套都有

| | TypeORM(主线) | Prisma(对照) |
|---|---|---|
| 范式 | **实体驱动**:`@Entity` 类 + 装饰器 + Repository | **Schema 驱动**:`schema.prisma` 生成类型安全客户端 |
| Java 类比 | JPA / Hibernate(几乎一一对应) | 类 MyBatis 的"配置先行"风格 |
| 定位 | 业务主存储(订单/支付/乐观锁/事务) | 沉浸式对照 Demo:prisma_orders 表 + $transaction |
| 结论 | Java 团队转 NestJS 的首选心智 | 前端口碑最好、类型安全天花板、面试加分项 |

**一句话**:本仓库主线走"Hibernate 心智",另开一条"Prisma 心智"并行跑同一张业务模型,
两条都实战过,才讲得清差异。

---

## 二、选型决策表(资深视角)

| 维度 | TypeORM | Prisma | 建议 |
|---|---|---|---|
| 动态 SQL / 复杂查询 | QueryBuilder(强) | 链式 API(中);复杂 SQL 走 `$queryRaw` | TypeORM |
| 类型安全 | 中等(实体类倒是任意形状) | 极高(generate 出来的全链路类型) | Prisma |
| 乐观锁 | `@VersionColumn` + 显式 WHERE version(仓库有) | 无内置,需手写事务+条件 | TypeORM |
| Migration 体验 | `typeorm migration:*`,SQL 手调空间大 | `prisma migrate`,文档/diff 体验最好 | Prisma |
| 多数据源/读写分离 | 原生支持(仓库 DatabaseModule.replicas) | 需手写多 PrismaClient + 路由 | TypeORM |
| 滚动/大数据写入 | 批量/事务编辑器成熟 | `createMany` 快,但 jsonb 等偏弱 | 看场景 |
| 生态系统(NestJS) | @nestjs/typeorm 官方一等公民 | 官方教程完整(本仓库即参照) | 均成熟 |

> 生产常见组合:主查询用 Prisma 的类型安全 + 报表/ETL 用 TypeORM QueryBuilder 或裸 pg。
> 本仓库演示的是"两种都接入同一 PG"的共存形态。

---

## 三、接入路线速查(可复现)

```
# 依赖
pnpm add @prisma/client @prisma/adapter-pg
pnpm add -D prisma @types/node

# schema(Prisma 7:datasource 只留 provider,连接 URL 移到 prisma.config.ts)
apps/orders/prisma/schema.prisma            # 模型 PrismaOrder / PrismaAuditLog
apps/orders/prisma.config.ts                # datasource.url = process.env.DATABASE_URL

# migration(与 TypeORM 共用同一个库,不能 migrate dev 重置整个 schema)
prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script \
  > prisma/migrations/<ts>_init/migration.sql   # 只生成新增表
psql ... -f <该文件>                          # 手动执行,不动 TypeORM 的表
prisma migrate resolve --applied <ts>_init   # 标记已应用,保持状态一致

# 生成客户端(输出到 src/generated/prisma,已 gitignore)
prisma generate
```

## 3.1 Prisma 7 的关键差异(2026 新版)

| 项 | Prisma 6(旧) | Prisma 7(本仓库) |
|---|---|---|
| generator | `prisma-client-js`(默认 node_modules) | `prisma-client`,**必须 output 到项目内** |
| schema 中 datasource.url | 写在 schema 里 | **删掉**,URL 移到 `prisma.config.ts` |
| 运行时连接 | Client 内置引擎 | **driver adapter**:`@prisma/adapter-pg` + pg |
| 模块格式 | CJS 直接可用 | 配 `moduleFormat = "cjs"` 对齐 NestJS 编译 |
| 客户端产物 | node_modules/.prisma/client | 项目内 `src/generated/prisma`(纯 TS,可随包走) |

## 3.2 已知坑与绕过(血泪教训)

1. **CJS 项目 import 兼容**:
   生成的 `client.ts`(入口 barrel)+ `@ts-nocheck` 在 CommonJS + node10 解析下
   会出现 `TS2307: Cannot find module .../client`(类型层断裂,运行层 OK)。
   **绕过**:import `internal/class`(功能等价:含全部模型的 interface 与
   `getPrismaClientClass()` 运行时构造器),PrismaService 改为"组合持有 +
   类型化 `client` 属性"。本仓库代码已注释说明。

2. **pnpm 严格布局**:`@prisma/client` 的内部依赖
   `@prisma/client-runtime-utils` 默认不进顶层 node_modules,node10 解析不到。
   **解法**:显式 `pnpm add @prisma/client-runtime-utils`(锁定同版本)。

3. **migrate dev 会想重置整个 public schema**(它不认识 TypeORM 的表,认为"脏")。
   **解法**:`migrate diff` 生成增量 SQL + `db execute`/psql 手动执行 +
   `migrate resolve --applied`,绝不 reset。

4. **prisma.config.ts 的 `env()` helper 对缺失变量直接抛异常**;
   无 CI 环境变量兜底时改用 `process.env['DATABASE_URL'] ?? 默认值`。

5. **Vite/打包类项目用 npm 而非 pnpm 通常更省事**(规避依赖布局差异)。
   本仓库已在 pnpm 下完整跑通,依赖布局差异已显式声明处理。

---

## 四、业务对照:同一条链路两种写法

```ts
// ---------- TypeORM(主线,订单主链路) ----------
@Injectable()
export class OrdersService {
  constructor(@InjectRepository(OrderEntity) private readonly repo: Repository<OrderEntity>) {}

  @Transactional()                                // 声明式事务(GLM)
  private async doCreate(dto, @TransactionManager() em?: EntityManager) {
    const saved = await (em ?? this.repo).save(entity);   // Repository 持久化
    return this.toOrder(saved);
  }
}

// ---------- Prisma(对照 Demo) ----------
@Injectable()
export class PrismaDemoService {
  constructor(private readonly prisma: PrismaService) {}  // 组合持有 client

  async createOrder(dto: CreateOrderDto) {
    const [order] = await this.prisma.client.$transaction([  // 数组式原子事务
      this.prisma.client.prismaOrder.create({ data: {...} }),
      this.prisma.client.prismaAuditLog.create({ data: { action: 'ORDER_CREATED' } }),
    ]);
    return this.toOrder(order);   // 生成的类型直接可读,无实体转换负担
  }
}
```

**对应关系**:

| 能力 | TypeORM | Prisma |
|---|---|---|
| 事务 | `@Transactional()` / `entityManager.transaction()` | `client.$transaction([...])` |
| 乐观锁 | `WHERE version` + affected 判定(仓库已实现) | 无内置,手写 |
| 分页 | QueryBuilder `skip/take` | `skip/take`(原生) |
| Json 字段 | `jsonb` 列直接存/读 | `Json` 类型,写需强转 |
| 金额 | `decimal` 列 + 实体类型 | `Decimal`(JS Decimal 实例,注意序列化) |
| 客户端入口 | DI 注入 Repository | DI 注入 PrismaService(内部持有 client) |

---

## 五、如何验证

```
# UI:三个 Prisma 接口都在网关(与 TypeORM 版并存)
POST /prisma/orders                # $transaction 双写(订单 + 审计)
GET  /prisma/orders                # 分页列表
GET  /prisma/orders/stats          # 两表计数(验证事务双写始终成对)

# DB:直接看表
psql ... -c "\dt prisma*"          # prisma_orders / prisma_audit_log
```

prisma_orders 与 prisma_audit_log 计数必须**始终相等**——这就是
$transaction"要么全成、要么全败"的活证据(与 TypeORM outbox 同事务思路同源)。

---

## 六、面试怎么讲(30 秒版)

> "我们生产用 TypeORM(实体驱动,团队 Java 心智平滑),同时完整接了一套
> Prisma 7 做对照:同一张业务模型两套写法的差异、Prisma 7 的 driver-adapter
> 架构与 config 迁移、以及 CJS 工程接入的兼容性处理,都在仓库里有实战记录。
> 选型结论:类型安全与开发速度选 Prisma,动态 SQL/乐观锁/多数据源选 TypeORM,
> 复杂报表两条都不够,直接上 QueryBuilder/裸 SQL。"
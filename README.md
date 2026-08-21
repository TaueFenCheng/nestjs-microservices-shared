# NestJS 微服务公共模块抽离实战仓库

> 一套可在多个 NestJS 微服务间共享的公共代码仓库(monorepo + shared library)。
> 包含**完整可运行的示例**(网关 + 2 个微服务)与**详尽的设计文档**。

---

## 目录

- [一、这个仓库解决什么问题](#一这个仓库解决什么问题)
- [二、仓库结构](#二仓库结构)
- [三、快速开始](#三快速开始)
- [四、核心思路(30 秒版)](#四核心思路30-秒版)
- [五、文档导航](#五文档导航)
- [六、示例包含的高级特性清单](#六示例包含的高级特性清单)
- [七、如何把公共库抽到独立 npm 包](#七如何把公共库抽到独立-npm-包)

---

## 一、这个仓库解决什么问题

微服务架构下,最常见的反模式是:**每个服务各自重复实现日志、鉴权、数据库连接、DTO、错误码、微服务客户端……**

结果:命名不一致、校验规则漂移、错误码各写一套、切换传输层要改所有服务——维护成本随服务数量爆炸。

本仓库演示的标准答案是:**把公共能力抽到一个共享库(`@app/shared`),每个微服务一行接入。**

```
┌─────────────────────────────────────────────────────────────┐
│                      @app/shared(公共库)                       │
│  DTO / 接口 / 错误码 / 消息常量 / guards / filters / interceptors │
│  LoggerModule / DatabaseModule / AuthModule / HealthModule    │
│  ClientsModule(统一微服务客户端) / 链路追踪 / 验证管道             │
└──────────────┬────────────────────┬──────────────────────────┘
               │ SharedModule.forRoot│
       ┌───────▼───────┐    ┌────────▼────────┐    ┌───────────┐
       │  api-gateway   │──▶ │     orders       │    │  billing   │
       │  (HTTP + Redis │    │   (Redis 传输)    │    │  (TCP 传输) │
       │   混合应用)     │    │   订单微服务       │    │  计费微服务  │
       └───────────────┘    └─────────────────┘    └───────────┘
```

**三个示例服务互不相同,却共享同一套公共库**——这正是"抽离 + 复用"的最佳演示。

---

## 二、仓库结构

```
nestjs-microservices-shared/
├── README.md                  # 本文档
├── docs/                      # 设计文档(详见"文档导航")
├── apps/
│   ├── api-gateway/           # 网关:HTTP + Redis 微服务(混合应用)
│   ├── orders/                # 订单微服务(Redis 传输)
│   └── billing/               # 计费微服务(TCP 传输)
├── libs/
│   └── shared/                # ★ 公共库 @app/shared
│       └── src/
│           ├── index.ts       # 公共库公开出口(public surface)
│           ├── dto/           # 跨服务 DTO + 校验规则
│           ├── interfaces/    # 领域模型 / 用户 / 调用协议
│           ├── constants/     # 错误码 / 消息模式 / DI token
│           ├── modules/       # logger / database / auth / health
│           ├── microservices/ # 统一客户端封装
│           ├── filters/       # 全局异常过滤器
│           ├── interceptors/  # 响应转换 / 链路追踪 / 日志
│           ├── pipes/         # 统一验证管道
│           └── utils/         # 请求上下文(AsyncLocalStorage)
├── nest-cli.json              # monorepo 工程配置
├── tsconfig.json              # 路径映射 @app/shared
├── docker-compose.yml         # 本地基础设施(Redis)
└── .env.example               # 环境变量模板
```

---

## 三、快速开始

```bash
# 1. 安装依赖
npm install

# 2. 启动基础设施(Redis)
docker compose up -d

# 3. 复制环境变量模板
cp .env.example .env

# 4. 分别启动三个服务(各自一个终端)
npm run start:dev:orders    # Redis 传输微服务
npm run start:dev:billing   # TCP 传输微服务
npm run start:dev:gateway   # 网关(HTTP + Redis)

# 5. 验证
curl http://localhost:3000/health          # 健康检查(公开)
curl -X POST http://localhost:3000/orders \
     -H 'Content-Type: application/json' \
     -H 'Authorization: Bearer <token>'   \
     -d '{"items":[{"sku":"A1","unitPrice":100,"quantity":2}]}'
```

> 需要真实数据库时:取消 `docker-compose.yml` 中 postgres 的注释,并把
> `apps/*/app.module.ts` 里 `SharedModule.forRoot({ database: { type: 'memory' } })`
> 替换为 `{ type: 'postgres', host: ..., ... }`,再接入 TypeORM(见 `docs/03`)。

---

## 四、核心思路(30 秒版)

1. **`exports` 是共享的地基**——NestJS 模块默认单例,`exports` 出去的 provider 在所有调用方间共享同一实例。
2. **`@Global()` 让基础设施免导入**——日志/鉴权/配置做成全局模块,任何服务直接注入。
3. **动态模块 `forRoot/forFeature` 让"一套代码、每服务一配置"**——同一公共模块,各服务传入自己的数据库/密钥/租户配置。
4. **传输层封装 `ClientsModule` 让业务不感知 broker**——Redis/Kafka/gRPC 切换只改一处。
5. **常量集中(`message-patterns.ts`)+ DTO 共享 + 错误码统一**——跨服务契约单一事实来源,编译期可查。

---

## 五、文档导航

| 文档 | 内容 |
|---|---|
| [`docs/01-architecture-overview.md`](docs/01-architecture-overview.md) | 架构总览、抽离方式的横向对比(monorepo 库 vs npm 包 vs submodule)、如何选型 |
| [`docs/02-shared-library-design.md`](docs/02-shared-library-design.md) | 共享库内部如何分层、公开面如何收敛、演进与版本化策略 |
| [`docs/03-module-fundamentals.md`](docs/03-module-fundamentals.md) | exports / @Global / 动态模块 / 自定义 provider 的深度讲解 |
| [`docs/04-microservice-abstractions.md`](docs/04-microservice-abstractions.md) | 微服务传输层抽象、请求-响应 vs 事件、超时重试、链路透传 |
| [`docs/05-advanced-features.md`](docs/05-advanced-features.md) | NestJS 高级特性全景清单(含示例与适用场景) |
| [`docs/06-go-live-checklist.md`](docs/06-go-live-checklist.md) | 上线清单、迁移步骤、生产注意事项 |

---

## 六、示例包含的高级特性清单

仓库代码通过**真实可运行**的示例覆盖了以下 NestJS 高级特性:

| # | 特性 | 示例位置 |
|---|---|---|
| 1 | Monorepo 共享库 + tsconfig paths | `nest-cli.json`、`tsconfig.json` |
| 2 | 动态模块 `forRoot/forRootAsync/forFeature` | `shared/modules/*/.*.module.ts` |
| 3 | `@Global()` 全局模块 | `LoggerModule`、`SharedModule`、`AuthModule` |
| 4 | 自定义 provider(`useValue`/`useFactory`/`useClass`) | `DatabaseModule`、`ClientsModule` |
| 5 | 全局守卫 + 元数据(`APP_GUARD`) | `JwtAuthGuard`、`RolesGuard` + `@Roles/@Public` |
| 6 | 参数装饰器(`createParamDecorator`) | `@CurrentUser()` |
| 7 | 全局管道(class-validator) | `SharedValidationPipe` |
| 8 | 全局过滤器 / 拦截器 | `AllExceptionsFilter`、`Transform/RequestId/LoggingInterceptor` |
| 9 | `AsyncLocalStorage` 请求上下文(链路追踪) | `utils/request-context.ts` |
| 10 | 微服务多种传输(Redis + TCP)+ 混合应用 | `apps/*/main.ts` |
| 11 | `@MessagePattern` / `@EventPattern`(请求-响应 vs 事件) | `orders/billing` 控制器 |
| 12 | `RpcException` 业务错误 + 错误码映射 | `billing.controller.ts` + `error-codes.ts` |
| 13 | 生命周期钩子 `OnModuleInit` / `OnApplicationShutdown` | `orders.service.ts`、`DatabaseService` |
| 14 | 健康检查 `@nestjs/terminus` | `HealthController` |
| 15 | 配置 `@nestjs/config` | `ConfigModule` + `config/configuration.ts` |
| 16 | 聚合模块一行接入 | `SharedModule.forRoot(...)` |

---

## 七、如何把公共库抽到独立 npm 包

monorepo 适合**代码同仓、快速迭代**;当共享代码需要被**多个独立仓库**消费或**严格版本化**时,把 `libs/shared` 提取为私有包:

```bash
# 方案 A:独立发布(私有 registry / Verdaccio / GitHub Packages)
cd libs/shared
npm run build            # 产出 dist
npm publish --registry http://your-private-registry

# 各微服务安装
npm install @company/shared@^2.1.0
```

```bash
# 方案 B:pnpm workspace 本地链接(无 registry)
# 根 pnpm-workspace.yaml
packages:
  - libs/shared
  - apps/*
# 微服务引用
pnpm add @company/shared --filter nginx-gateway
```

> 采用 npm 包方案后,`index.ts` 的公开面就成为**npm 包稳定 API**,务必配合语义化版本 + 破坏性变更的 `BREAKING CHANGE` 说明(详见 `docs/02`)。

---

## 许可证

MIT

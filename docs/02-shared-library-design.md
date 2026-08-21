# 02 · 共享库内部设计

> 目标:说明 `@app/shared` 内部如何分层、公开面如何收敛、如何演进。

---

## 1. 分层总览

```
libs/shared/src
├── dto/           # 跨服务传输的数据结构(带 class-validator 校验)
├── interfaces/    # 领域枚举/模型、JWT、调用协议
├── constants/     # 错误码、消息 pattern、DI token
├── modules/       # 业务无关的公共模块(logger/database/auth/health)
├── microservices/ # 统一微服务客户端与调用封装
├── filters/       # 全局异常过滤器
├── interceptors/  # 响应转换 / 链路追踪 / 日志
├── pipes/         # 统一验证管道
├── utils/         # AsyncLocalStorage 请求上下文
└── index.ts       # ★ 公开出口
```

分层原则:**稳定的基础类型在内层(interfaces/constants),偏展示与 HTTP 的在外层
(interceptors/filters),公共业务模块居中(modules)。**

---

## 2. 公开面收敛(`index.ts` 是唯一门面)

- 所有消费方只能 `import { X } from '@app/shared'`;
- 内部模块**不该**被直接 `@app/shared/modules/...` 深路径引用;
- 用 eslint 强制(`import/no-internal-modules`)或 code review 约束。

```ts
// libs/shared/src/index.ts (示意)
export * from './dto/pagination.dto';
export * from './modules/logger/logger.module';
export * from './constants/message-patterns';
// ... 其余按需导出
```

**好处**:重构内部实现(改目录、拆文件)不影响任何消费方;若未来发布 npm 包,
此文件即稳定 API 边界。

---

## 3. 公共模块的内部约定

### 3.1 模块命名与静态方法约定

| 模块 | 静态方法 | 语义 |
|---|---|---|
| `DatabaseModule` | `forRoot / forRootAsync` | 只初始化一次的核心连接(全局) |
| `AuthModule` | `forRoot` | 只初始化一次的鉴权配置(全局) |
| `LoggerModule` | `forRoot` | 全局日志 + 服务名 |
| `ClientsModule` | `forFeature / forStandardClients` | 按需注册多个微服务客户端 |
| `HealthModule` | — | 健康检查(固定) |

> 统一约定 `forRoot`(全局一次)与 `forFeature`(按需扩展),见 `docs/03`。

### 3.2 配置必须注入,不许硬编码

```ts
// ✓ 通过 forRoot 由各服务注入
DatabaseModule.forRoot({ host: process.env.DB_HOST, ... })
// ✗ 公共模块里直接 process.env / 写死
```

---

## 4. 枚举与常量的"权威性"

- **错误码**(`error-codes.ts`):0 成功,1xxx 通用,2xxx 订单,3xxx 支付,4xxx 用户。
  各服务抛 `RpcException({ code, message })`,网关统一映射 HTTP。
- **消息模式**(`message-patterns.ts`):`ORDER_CREATE` 等集中命名,杜绝裸字符串。
- **DI token**(`tokens.ts`):`Symbol` 枚举,避免字符串魔法。

> 规则:新增跨服务常量**必须**先进共享库,再在服务里使用;禁止服务自行定义
> 与共享库同语义的常量(会造成双份事实)。

---

## 5. 领域模型:共享实体 VS 各自实现

**原则**:跨服务都要识别/传递的稳定概念(订单、支付、用户身份)放共享库;
服务内部实现细节(数据库表、内部状态机扩展)留在各自服务。

- 共享:`Order`、`OrderStatus`、`UserRole`、`JwtPayload`(跨服务必须一致)
- 各服务私有:本地缓存的表结构、仅本地使用的领域服务内部对象

---

## 6. 演进与版本化

### 6.1 演进规则

1. 先加**新增**后改**破坏**:新字段可选、新常量先加;
2. 需要删/改名时,先 `@deprecated` 一个版本,再移除;
3. 改共享受限类型时,全仓搜索所有使用方一起改。

### 6.2 是否升级为独立 npm 包?

满足以下任一,考虑把 `libs/shared` 独立发布:

- 被**多个独立仓库**消费;
- 需要**独立的升级节奏**与 CHANGELOG;
- 有外部团队依赖它的稳定 API。

发布流程建议:

```bash
# 1) 拆分出独立 package(或从 libs 复制)
# 2) 锁定 dependencies(peerDependencies 声明 @nestjs/* )
cd shared-pkg
npm run build
npm version minor -m "chore: release shared %s"
npm publish
# 3) 主仓移除 libs/shared,改为依赖 npm 包
```

> npm 包方案下,`index.ts` 公开面即稳定 API,务必 SemVer + BREAKING CHANGE。

# 01 · 架构总览与抽离方案对比

> 目标:回答"**为什么**要抽离公共模块,以及有哪几种抽离方式、各自何时选用"。

---

## 1. 为什么要抽离

微服务规模一上来,如果不抽离公共代码,会出现:

- **DTO 漂移**:订单实体在 A 服务叫 `OrderDto`,在 B 服务叫 `OrderVO`,字段还不一样;
- **错误码各写各的**:A 服务用 `'NOT_FOUND'`,B 服务用 `404`,调用方无法统一解释;
- **鉴权/日志/数据库连接每处重写**:修一处 bug 要在 N 个服务各改一遍;
- **消息契约不可检索**:pattern 裸字符串散布代码,改名靠肉眼搜索;
- **切换传输层成本高**:从 Redis 迁 Kafka 时,每个服务都要动。

抽离公共模块,本质是把**不变的横切能力**与**跨服务的领域契约**收敛到单一事实来源(SSOT)。

---

## 2. 三条拆解原则

| 原则 | 说明 |
|---|---|
| **按"变化频率"分** | 不变的(日志、错误码、DTO)放公共层;变化快、服务特有的(业务编排)留在各自服务 |
| **按"依赖方向"分** | 公共层**只能向下依赖**平台/三方库,**不能反向依赖**任何业务服务 |
| **按"公开面"收口** | 对外只暴露 `index.ts` 里明确列出的 API,内部实现自由迭代 |

---

## 3. 三种抽离方式对比

| 维度 | ① Monorepo 共享库 | ② 私有 npm 包 | ③ git submodule |
|---|---|---|---|
| 落地方式 | `nest generate library` + tsconfig paths | 发布到私有 registry / workspace 链接 | 引第三方仓库子目录 |
| 代码位置 | 同仓同步 | 独立版本受控 | 独立仓库子目录 |
| 迭代速度 | ★★★(改完即用) | ★★(需发版) | ★(需子仓库提交) |
| 跨仓库复用 | ✗(仅本仓) | ✓ | ✓ |
| 版本管理 | 跟随主仓 SemVer | 独立 SemVer,可锁定 | 跟随子仓库 commit |
| 调试体验 | 最好(断点直达) | 一般(packed 代码) | 一般 |
| 引入成本 | 低 | 中(需 registry) | 低 |

### 选型建议

- **单仓多服务、快速迭代** → **Monorepo 共享库**(本仓库默认方案)
- **多团队独立交付、需要稳定契约** → **私有 npm 包**
- **团队已重度使用 submodule + 单仓即多仓** → submodule(不推荐新建项目采用)

> 实践上很多团队走**混合**:`libs` 里公共 X 快速增长期用 monorepo,频繁被外部引用
> 的稳定部分(如 protobuf 文件、公共 SDK)单独发 npm 包。

---

## 4. Monorepo 的工程约定

### 4.1 路径映射(`tsconfig.json`)

```json
{
  "compilerOptions": {
    "paths": {
      "@app/shared": ["libs/shared/src"],
      "@app/shared/*": ["libs/shared/src/*"]
    }
  }
}
```

### 4.2 生成命令

```bash
nest new my-company --monorepo --strict
nest generate app orders
nest generate app billing
nest generate library shared   # 生成 @app/shared
```

### 4.3 每个 app / lib 独立的 tsconfig

`nest-cli.json` 里 `projects` 声明 `api-gateway`、`orders`、`billing`(application)与
`shared`(library),各自的 `tsconfig.app.json` / `tsconfig.lib.json` 独立编译,
产出到 `dist/apps/*`、`dist/libs/*`,互不污染。

---

## 5. 本示例的架构图

```
                 HTTP :3000
                      │
              ┌───────▼────────┐       Redis:6379
              │   api-gateway   │◄───────────────┐
              │   (混合应用)     │                │
              └───┬────────┬───┘                │
                  │ Redis  │ TCP:4001           │
                  │        │                    │
        ┌─────────▼──┐  ┌──▼─────────┐          │
        │   orders    │  │   billing   │─────────┘
        │  (Redis传输) │  │  (TCP传输)   │ 交易成功发事件
        └─────────────┘  └────────────┘
                 ▲______________▲
                 │  @app/shared │
          (each app 一行 SharedModule.forRoot 接入)
```

- **网关**负责鉴权、参数校验、编排;**orders/billing**只做领域逻辑;
- **事件驱动**让订单支付成功这类"通知"不阻塞主链路(解耦);
- 传输层 Redis/TCP 差异被公共库抹平,便于将来统一迁移到 Kafka/gRPC。

---

## 6. 关键取舍与风险

| 取舍 | 说明 |
|---|---|
| **AI 生成/样板反模式** | 不要用复制粘贴"做一套公共库",要真正按依赖方向设计 |
| **过早抽离** | 只有 1~2 个服务时别急着抽,等出现第二个消费方再抽象(规则 of two) |
| **公共库过度膨胀** | 把服务特有代码塞进共享库等于制造"上帝模块",保持按域分层 |
| **契约冻结** | 一旦发布环npm包,公开面即稳定;用 `@deprecated` 而非即删 |

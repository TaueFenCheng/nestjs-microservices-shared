# 06 · 上线清单与迁移指南

> 把"共享库"从示例搬到生产环境前的检查表与渐进迁移路径。

---

## 1. 渐进迁移路径(从现有单体/多服务改造成共享库)

推荐"**先立共享库骨架 → 逐步搬移 → 最终瘦身服务**"，避免一次性大爆炸重构。

```text
阶段 0  搭骨架:nest generate library shared,+ tsconfig paths
阶段 1  搬"零风险基础件":错误码、消息常量、DI token、DTO/interfaces
阶段 2  搬"横切件":logger、异常过滤器、拦截器、验证管道(行为对齐再切)
阶段 3  搬"公共模块":DatabaseModule、AuthModule、HealthModule
阶段 4  搬"传输抽象":ClientsModule + ClientProxyFactoryService
阶段 5  各服务根模块收敛为 SharedModule.forRoot(...) 一行
阶段 6  (可选)契约稳定后,将 shared 发布为私有 npm 包
```

> 每一步都可独立回归;第 1~2 步基本对调用方无感，风险最低。

---

## 2. 上线检查清单

### 配置与安全
- [ ] `.env` 不入库,密钥走密钥管理(Vault/KMS)，`JWT_SECRET` 强随机
- [ ] 各服务 `SharedModule.forRoot` 的 database/auth 配置来自 `.env` 而非硬编码
- [ ] DTO 校验已全局开启,`whitelist: true` 拦截多余字段
- [ ] 敏感字段(密码哈希、内部 token)用序列化器/排除字段,不进响应与日志

### 契约与一致性
- [ ] 错误码、消息 pattern、DI token 全部来自 `@app/shared`,无服务自造重复常量
- [ ] DTO/领域模型单一来源,无跨服务拷贝副本
- [ ] message-patterns 常量表与所有 `@MessagePattern/@EventPattern` 一一对账

### 健壮性
- [ ] `ClientProxyFactoryService.call` 已设超时,关键链路有重试
- [ ] 事件消费方幂等(以业务键去重)
- [ ] 优雅下线:实现 `OnApplicationShutdown`,先摘流再关连接
- [ ] 健康检查 `/health` 已接 K8s liveness/readiness 与注册中心

### 可观测性
- [ ] requestId 全链路透传(网关 → 微服务 → 日志)
- [ ] 统一日志格式 + 服务名标识,已接采集/检索(ELK/Loki)
- [ ] (可选)OpenTelemetry 分布式追踪与指标

### 工程化
- [ ] `tsconfig` strict 开启,`npm run typecheck` 通过
- [ ] NestJS 版本统一(共享库与各服务同 major,避免 ABI 冲突)
- [ ] CI 对 shared 库构建 + 各服务构建/测试并行把关

---

## 3. 生产注意事项(易踩的坑)

1. **版本漂移**:多个服务依赖不同 `@nestjs/*` 大版本会导致共享库注入错位。
   用 pnpm/npm 锁定,或把 `@nestjs/*` 设为 peerDependencies。
2. **全局模块滥用**:`@Global()` 只给日志/配置/鉴权，业务模块别全局化。
3. **循环依赖**:共享库依赖业务服务是不允许的;如出现双向依赖,重新分层。
4. **REQUEST 作用域扩散**:共享 provider 若为 REQUEST 作用域,整个依赖链都变，
   影响性能,只在确需请求隔离时用。
5. **契约即 API**:发布 npm 包后,公开面改动即破坏性变更,严守 SemVer。
6. **内存态**:示例用内存 Map,生产必须接持久化存储,否则重启丢数据。

---

## 4. 维护与治理

- **Code Owner**:共享库设单一负责人/团队,改动要有评审;
- **CHANGELOG**:任何公开面变化记录,破坏性变更标注 BREAKING;
- **使用说明书**:维护一份"新增公共能力/N 条规则"(本文档 + docs/05 即素材);
- **定期对账**:审计各服务是否还在"自己造轮子"(重复 DTO/常量/日志)并及时收敛。

---

## 5. 后续可扩展方向

- 添加 `user` 微服务(Redis/NATS)复用同一 `SharedModule`;
- 把传输从 Redis/TCP 迁移到 Kafka(改 `main.ts` + `ClientsModule`,业务零改动验证抽象价值);
- 引入 OpenTelemetry 做完整分布式追踪;
- 增加 `@nestjs/schedule` 定时对账、`@nestjs/event-emitter` 进程内事件;
- 用 turborepo/pnpm workspace 统一构建编排与缓存。

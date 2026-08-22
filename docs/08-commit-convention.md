# 08 · Git 提交规范(Commit Convention)

> 本仓库已配置 **commitlint + husky + commitizen(cz-git)** 三件套:
> 提交信息不符合规范会被 pre-commit 钩子拦下,想偷懒都偷不了。

---

## 1. 一句话规范

```text
<type>(<scope>): <subject>

<body>          (可选)
<footer>        (可选,如 BREAKING CHANGE / 关联 issue)
```

示例:

```text
feat(shared): 新增幂等、分布式锁、Outbox 可靠性模块

- IdempotencyService:基于 Redis SET NX EX 的幂等执行
- DistributedLockService:SET NX PX + Lua 原子释放,防误删
- OutboxService:先持久化再可靠投递,失败自动重试

BREAKING CHANGE: SharedModule.forRoot 新增 reliability 可选配置
```

---

## 2. type 类型(必须小写)

| type | 含义 | 示例 |
|---|---|---|
| `feat` | 新功能 | `feat(orders): 订单创建支持幂等键` |
| `fix` | 修复缺陷 | `fix(gateway): 修复 Saga 补偿吞异常` |
| `docs` | 文档变更 | `docs: 新增生命周期钩子总结` |
| `style` | 格式调整(不改逻辑) | `style: prettier 统一格式` |
| `refactor` | 重构(不改变功能) | `refactor(shared): 抽取 RedisService` |
| `perf` | 性能优化 | `perf(gateway): 缓存订单列表` |
| `test` | 测试相关 | `test(billing): 补充幂等测试` |
| `build` | 构建/依赖变更 | `build: 升级 @nestjs/core 到 11` |
| `ci` | CI 配置变更 | `ci: 添加 GitHub Actions` |
| `chore` | 杂项(工具/格式化) | `chore: 配置 commitlint` |
| `revert` | 回滚提交 | `revert: 回滚 xxx` |

## 3. scope(可选)

本仓库建议的 scope:公共库 / 各服务 / 文档:

```
public      # 仓库层面(README、脚本、全局配置)
shared      # libs/shared(公共库)
orders      # orders 微服务
billing     # billing 微服务
api-gateway # 网关
docs        # docs/ 文档
```

## 4. 硬性规则(commitlint 强制)

| 规则 | 约束 |
|---|---|
| type 必须小写且在枚举内 | `Feat:` ✗ `feat:` ✓ |
| header 长度 ≤ 72 | 超长会被拦 |
| subject 不能为空、结尾不能是 `.` | `feat(x): 新增xx.` ✗ |
| body 前要有空行 | 多行信息第一行空一行 |
| footer(BREAKING CHANGE / issue)前要有空行 | 规范收尾 |

## 5. 推荐工作流

```bash
# 1. 交互式生成符合规范的提交信息
npm run commit          # 等价于 npx cz,走 cz-git 中文向导

# 2. 或手写规范信息(commitlint 会自动校验)
git commit -m "feat(shared): 新增分布式锁模块"

# 3. 提交前自动做的事
#    pre-commit: npm run typecheck(类型不过不让提交)
#    commit-msg: commitlint 校验提交信息格式
```

## 6. 为什么值得坚持

- **可读性**:`git log --oneline` 一眼看懂每笔提交的意图和影响面;
- **可追溯**:`git log --grep="^feat"` 快速筛选"新增了什么";
- **自动化基础**:CHANGELOG 生成(conventional-changelog)、语义化版本(semver-release)、
  CI 触发规则(如仅 feat/fix 构建)都依赖规范化的 type;
- **团队协作**:代码评审时按提交粒度审查,规范即共识。

> 一句话:提交信息是写给"未来的维护者(包括三个月后的自己)"看的文档,
> 花 10 秒写规范,省未来 10 分钟。
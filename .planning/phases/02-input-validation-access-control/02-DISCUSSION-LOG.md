# Phase 2: Input Validation & Access Control - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 2-Input Validation & Access Control
**Areas discussed:** CSRF 中间件架构, 速率限制粒度与值, 文件验证执行点, 并发冲突错误 UX

---

## CSRF 中间件架构

| Option | Description | Selected |
|--------|-------------|----------|
| Next.js middleware.ts | Edge Runtime 拦截所有 /api/* POST，无需改路由代码 | ✓ |
| 路由级包装函数 | wrapCsrf(handler) 包装，侵入性强 | |
| You decide | Claude 根据架构一致性决定 | |

**User's choice:** Next.js middleware.ts
**Notes:** Single entry point, no individual route changes needed

| Option | Description | Selected |
|--------|-------------|----------|
| 不保护未认证路由 | 无会话用户无 CSRF 攻击向量 | ✓ |
| 全部保护 | 所有 POST 路由都校验 Origin | |
| You decide | Claude 决定 | |

**User's choice:** 不保护未认证路由
**Notes:** auth/request-link 无需 CSRF 保护

| Option | Description | Selected |
|--------|-------------|----------|
| 严格匹配 APP_URL | Origin 必须严格匹配 | |
| 匹配 APP_URL + 子域名 | 多域部署友好 | ✓ |
| You decide | Claude 决定 | |

**User's choice:** 匹配 APP_URL + 子域名

---

## 速率限制粒度与值

| Option | Description | Selected |
|--------|-------------|----------|
| 每路由独立配置 | 每路由单独配置窗口和限额，精确但配置多 | |
| 全局统一 + 少数例外 | 全局统一限额 + 特殊路由覆盖 | ✓ |
| You decide | Claude 决定 | |

**User's choice:** 全局统一 + 少数例外

| Option | Description | Selected |
|--------|-------------|----------|
| 429 + Retry-After | 标准 HTTP 响应 + 重试信息 | ✓ |
| 429 无 Retry-After | 静默拒绝 | |
| You decide | Claude 决定 | |

**User's choice:** 429 + Retry-After

| Option | Description | Selected |
|--------|-------------|----------|
| middleware.ts 中（与 CSRF 合并） | 一次中间件处理 CSRF + 限速 | ✓ |
| 路由级调用 | 手动调用 rateLimiter 工具函数 | |
| You decide | Claude 决定 | |

**User's choice:** middleware.ts 中与 CSRF 合并
**Notes:** Edge Runtime 无状态，内存限速在 serverless 生产环境不可靠，需 Redis 后端迁移路径

---

## 文件验证执行点

| Option | Description | Selected |
|--------|-------------|----------|
| Route config + 程序化 | bodySizeLimit + handler 内文件类型检查 | ✓ |
| 纯程序化校验 | 仅 handler 内 Buffer.length + MIME 检查 | |
| You decide | Claude 决定 | |

**User's choice:** Route config + 程序化

| Option | Description | Selected |
|--------|-------------|----------|
| 宽泛白名单 | ZIP, PDF, 图片, 文档格式 | ✓ |
| 最小化白名单 | 仅 ZIP 和 PDF | |
| You decide | Claude 决定 | |

**User's choice:** 宽泛白名单
**Notes:** 交付上传需支持多种文件类型，智能体上传保留现有 zip-validator.ts

---

## 并发冲突错误 UX

| Option | Description | Selected |
|--------|-------------|----------|
| 统一 409 JSON | 所有并发冲突返回 409 + JSON 错误 | ✓ |
| 因端点而异 | 不同端点不同响应格式 | |
| You decide | Claude 决定 | |

**User's choice:** 统一 409 JSON
**Notes:** Webhook 触发的冲突（DATA-03）返回 200（幂等处理）

---

## Claude's Discretion

- 具体速率限额值（每桶每分钟请求数）
- 滑动窗口算法细节
- MIME 检测方式（文件扩展名 vs magic bytes）
- 子域名匹配正则/逻辑
- 上传路由是否需要 `maxDuration` 配置

## Deferred Ideas

None — discussion stayed within phase scope.

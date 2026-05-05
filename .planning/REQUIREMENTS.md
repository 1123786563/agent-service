# Requirements: Hermes Agent Marketplace — Security Hardening

**Defined:** 2026-05-05
**Core Value:** 每个 HIGH 安全漏洞关闭 + 每个状态变更端点需要认证 — 生产环境无未认证变更

## v1 Requirements

### Critical Security Fixes (SEC)

- [ ] **SEC-01**: 开发支付路由 `GET /api/payments/dev/complete` 置于 `NODE_ENV` 检查 + 管理员认证之后
- [ ] **SEC-02**: 咨询创建端点 `POST /api/consultations` 添加用户认证要求
- [ ] **SEC-03**: 所有 `/api/*` POST 路由添加 CSRF Origin 头验证
- [ ] **SEC-04**: 为认证、咨询、上传、Webhook 端点添加速率限制（内存滑窗 + 接口可扩展到 Redis）
- [ ] **SEC-05**: 交付物上传添加文件大小限制（匹配代理包 25MB 上限）
- [ ] **SEC-06**: 交付物上传添加文件类型白名单验证
- [ ] **SEC-07**: 生产环境启动时验证必需环境变量（DATABASE_URL, APP_URL, DOWNLOAD_TICKET_SECRET, STRIPE_*, ADMIN_EMAILS 等），缺失则 fail-fast
- [ ] **SEC-08**: `requireCreator()` 添加 `role === CREATOR` 检查

### Data Integrity (DATA)

- [ ] **DATA-01**: 退款+争议解决包装在 `$transaction` 中，防止非原子操作导致双重退款
- [ ] **DATA-02**: 支付账本 `recordPaymentEvent` 捕获 P2002 唯一约束错误作为重复处理
- [ ] **DATA-03**: 订单状态转换使用 `updateMany` + 条件 `where` 实现乐观并发
- [ ] **DATA-04**: 智能体包评价添加 `(agentPackageId, userId)` 唯一约束防重复
- [ ] **DATA-05**: 顾问创建端点修复竞态条件（consultation-to-order）

### Authentication Expansion (AUTH)

- [ ] **AUTH-01**: 添加基于密码的登录（邮箱 + 密码注册/认证，Argon2id 哈希）
- [ ] **AUTH-02**: 添加 Google OAuth 登录（Authorization Code Flow + PKCE，Arctic 库）
- [ ] **AUTH-03**: 添加 GitHub OAuth 登录（复用 OAuth 基础设施）
- [ ] **AUTH-04**: 添加退出登录功能（删除会话 + 清除 cookie）
- [ ] **AUTH-05**: 添加生产邮件发送（Resend 适配器，复用现有 adapter 模式）
- [ ] **AUTH-06**: 订单路由按用户 ID 而非邮箱验证买家身份（为 OAuth 多邮箱做准备）

### Security Hardening (HARD)

- [ ] **HARD-01**: 角色/白名单变更时撤销该用户所有会话
- [ ] **HARD-02**: 审计日志记录认证事件（登录、注册、密码修改、OAuth 绑定、登录失败）
- [ ] **HARD-03**: 通过 middleware 添加安全头（X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy）
- [ ] **HARD-04**: 密码登录失败 N 次后锁定账户（依赖速率限制 + 密码认证）
- [ ] **HARD-05**: Stripe webhook 时间戳校验，拒绝超过 5 分钟的旧事件
- [ ] **HARD-06**: 完整 Content Security Policy，白名单化 Google/GitHub OAuth 域名和 Stripe

### Session Management (SESS)

- [ ] **SESS-01**: 过期会话和 Magic Link token 定期清理

## v2 Requirements

### Deferred Enhancements

- **2FA-01**: 双因素认证（TOTP），优先为管理员账户启用
- **WEB-01**: WebAuthn / Passkeys 作为 2FA 方法
- **CAP-01**: Cloudflare Turnstile 验证（如果速率限制不足时启用）

## Out of Scope

| Feature | Reason |
|---------|--------|
| NextAuth.js / Auth.js 集成 | 现有自定义认证系统完善，迁移成本高于扩展收益 |
| SAML / 企业 SSO | 非 B2B 产品，无企业客户需求 |
| 安全问题恢复 | NIST 已废弃，Magic Link 已覆盖密码重置场景 |
| Twitter/Facebook/Apple 登录 | 目标用户群体与 Google/GitHub 高度重叠 |
| IP 封禁 / 地理封锁 | 脆弱且过度，速率限制足够 |
| CAPTCHA | 增加用户摩擦，速率限制 + 账户锁定可替代 |
| 移动应用 | 仅限 Web 平台 |
| 实时通知 | 非安全关键 |
| 管理后台重设计 | 功能可用 |
| 性能优化（N+1 查询、分页） | 独立里程碑 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 1 | Pending |
| SEC-02 | Phase 1 | Pending |
| SEC-07 | Phase 1 | Pending |
| SEC-08 | Phase 1 | Pending |
| DATA-01 | Phase 1 | Pending |
| DATA-02 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| SEC-03 | Phase 2 | Pending |
| SEC-04 | Phase 2 | Pending |
| SEC-05 | Phase 2 | Pending |
| SEC-06 | Phase 2 | Pending |
| DATA-03 | Phase 2 | Pending |
| DATA-04 | Phase 2 | Pending |
| AUTH-01 | Phase 3 | Pending |
| AUTH-02 | Phase 3 | Pending |
| AUTH-03 | Phase 3 | Pending |
| AUTH-05 | Phase 3 | Pending |
| AUTH-06 | Phase 3 | Pending |
| HARD-01 | Phase 4 | Pending |
| HARD-02 | Phase 4 | Pending |
| HARD-03 | Phase 4 | Pending |
| HARD-04 | Phase 4 | Pending |
| HARD-05 | Phase 4 | Pending |
| HARD-06 | Phase 4 | Pending |
| SESS-01 | Phase 4 | Pending |
| DATA-05 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-05*
*Last updated: 2026-05-05 after initial definition*

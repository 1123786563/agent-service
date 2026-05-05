# Phase 1: Critical Security Fixes - Discussion Log

**Date:** 2026-05-05
**Mode:** Default (interactive)

---

## Gray Areas Discussed

### 1. Refund Atomicity (DATA-01)

**Question:** 退款+争议的原子性策略？Stripe 是外部调用无法加入 DB 事务。

**Options presented:**
1. Stripe 先行 + 原子 DB — 先调 Stripe 退款，成功后将 DB 退款记录 + 争议解决包装在 $transaction 中
2. 幂等检查 + 包装 — 在 $transaction 中先做幂等性检查，然后调 Stripe，再原子记录
3. 状态机模式 — 退款记录和争议解决分两步：PENDING → COMPLETED

**User selected:** 状态机模式

**Notes:** 退款先创建 PENDING 状态记录，调 Stripe 后由争议解决步骤原子性地校验并标记完成。重试安全，因为会检查退款状态。

---

### 2. Environment Variable Validation (SEC-07)

**Question:** 环境变量验证放在哪里？

**Options presented:**
1. instrumentation.ts — Next.js 官方启动钩子
2. Config 模块 — import 时自动验证
3. 两者结合 — config 做 Zod schema，instrumentation 做 fail-fast

**User selected:** instrumentation.ts

**Notes:** 使用 Next.js 官方启动钩子，只在生产环境验证，fail-fast with process.exit(1)。

---

### 3. Logout UX (AUTH-04)

**Question:** 退出登录按钮放哪？

**Options presented:**
1. 新建导航栏 — 包含 logo + 用户信息 + 退出按钮
2. 账户页内联 — 只在 /account/orders 添加退出按钮
3. 只做后端 — 不加 UI，通过 API 路由退出

**User selected:** 账户页内联

**Notes:** 最小 UI 变更，不新建导航栏。使用 server action（自带 CSRF 保护）。

---

## Areas with Claude's Discretion

The following areas had clear solutions — no user discussion needed:
- SEC-01 (dev route guard): NODE_ENV check + requireAdmin()
- SEC-02 (consultation auth): getCurrentUser() check
- SEC-08 (requireCreator role): Add role === CREATOR check
- DATA-02 (ledger race): Catch P2002, treat as duplicate

---

*Discussion completed: 2026-05-05*

# finance_next Platform Rewrite — Execution Plan

> 2026-05-12 · 配套 spec: `../specs/2026-05-12-platform-rewrite-design.md`
> 编排模式: Wave (顺序阻塞) → Node (并行可独立 worktree)

每个 Node 设计成可由独立 subagent 在 worktree 内完成；目标 diff ≤ ~500
行。Node ID 形如 `<Wave>.<Letter>.<num>`（例 `1.A.1`）。

---

## Wave 1 — Auth foundation (顺序，阻塞所有后续 wave)

Auth 是所有 user-scoped 资源的前置条件；先打牢这层，后续 wave 的 user
context 才是可信的。

### Node 1.A.1 — Gateway: 用户模型 + JWT auth middleware + 注册/登录/登出

**任务**: 加 `users` + `invitations` 两个 Mongo 集合 + repo + handler；
实现 `POST /api/v1/auth/{register,login,logout,me}` + `WithAuth`
middleware（在白名单外强制 401）；JWT HS256 + httpOnly cookie；argon2id
hash；启动时 bootstrap 检查（users 空 → 第一次 register 给 admin role）。

**涉及文件**:
- 新建 `gateway/internal/domain/user.go`、`invitation.go`
- 新建 `gateway/internal/store/mongo/user_repo.go`、`invitation_repo.go`
- 新建 `gateway/internal/http/handlers/auth.go` + `auth_test.go`
- 新建 `gateway/internal/http/middleware/auth.go` + `auth_test.go`
- 改 `gateway/internal/config/config.go` — 加 `AuthJWTSecret` /
  `AuthJWTTTLSeconds` / `AuthCookieDomain` / `AuthCookieSecure`，前者必填
- 改 `gateway/internal/http/router.go` — 在 `v1` group 上加 WithAuth 中
  间件（白名单 `/auth/register|login|accept-invite`）；mount AuthHandler
- 改 `gateway/cmd/gateway/main.go` — wire UserRepo / InvitationRepo /
  AuthHandler；保留 `runUserIDBackfills`
- 改 `gateway/go.mod` — 加 `github.com/golang-jwt/jwt/v5` +
  `github.com/matthewhartstonge/argon2` (or std `golang.org/x/crypto/argon2`)
- 新建 `gateway/.env.example` 加 `AUTH_JWT_SECRET` 段说明

**所有 repo 增改**: 仅新建 user_repo / invitation_repo；其它 repo 这一节
**不动**（仍读 echo context 的 userId，逻辑兼容）。

**新 endpoint**:
- `POST /api/v1/auth/register {email, password}` → 201 + Set-Cookie
- `POST /api/v1/auth/login {email, password}` → 200 + Set-Cookie
- `POST /api/v1/auth/logout` → 204 (clear cookie + 黑名单 jti)
- `GET  /api/v1/auth/me` → 200 user
- `POST /api/v1/auth/invite {email, role}` (admin) → 201 inviteURL
- `POST /api/v1/auth/accept-invite {token, password}` → 201 + Set-Cookie

**破坏性变更**: **yes** — `AUTH_JWT_SECRET` 必填，旧部署不设会启动失败。需在
 升级文档明确写。`X-User-Id` header 继续被 middleware 接受 (作为 system-to-system
预留)，但 cookie 优先。

**验收命令**:
```bash
cd gateway && go test ./internal/http/handlers/... ./internal/http/middleware/... ./internal/store/mongo/...
go vet ./...
# 手测
AUTH_JWT_SECRET=$(openssl rand -hex 32) go run ./cmd/gateway &
curl -X POST localhost:3001/api/v1/auth/register -d '{"email":"a@b","password":"P@ssw0rd!"}' -H 'Content-Type: application/json' -c /tmp/c
curl localhost:3001/api/v1/auth/me -b /tmp/c | jq .role  # → "admin"
curl localhost:3001/api/v1/option -b /tmp/c              # → 200 (auth ok)
curl localhost:3001/api/v1/option                        # → 401
```

**依赖**: 无（Wave 1 首节点）。

---

### Node 1.A.2 — Mongo migration: 给所有 user-scoped 集合补 `userId` + claim-legacy 端点

**任务**: 给 `ai_recommendations` / `optimization_runs` / `backtest_results`
三个**还没有** `userId` 字段的集合加索引和 backfill；新增
`POST /api/v1/admin/users/claim-legacy` (admin only) 把所有
`userId="default"` 的旧文档批量改写到当前 admin user 的 id。

**涉及文件**:
- 改 `gateway/internal/domain/{recommendation,optimization_run,backtest}.go`
  (取决于实际定义位置) — 加 `UserID string`
- 改 `gateway/internal/store/mongo/recommendation_repo.go`、
  `recommendation_repo_test.go`、`backtest_repo.go` —
  加 `EnsureUserIDIndex` + `BackfillMissingUserID`（参考已有
  `option_repo.BackfillMissingUserID` 形态）
- 改 `gateway/cmd/gateway/main.go::runUserIDBackfills` — 加入新三个 repo
- 新建 `gateway/internal/http/handlers/admin_users.go` —
  `POST /api/v1/admin/users/claim-legacy` 实现（事务批量 UpdateMany 把
  `userId="default"` 改为请求 user 的 id）
- `admin_users_test.go` — 走完整 flow

**所有 repo 增改**: option / account / order / wallet / prediction_strategy /
prediction_order 不动（已有字段）；recommendation / optimization_run /
backtest 三个补 userId。

**新 endpoint**: `POST /api/v1/admin/users/claim-legacy` → `{updatedCounts:
{options: n, accounts: n, …}}`。

**破坏性变更**: **no** — 字段添加是 idempotent；旧文档读时 userId 字段
缺失会被 backfill 填上 "default"。

**验收命令**:
```bash
cd gateway && go test ./internal/store/mongo/...
# 手测
docker compose -f infra/docker-compose.yml up -d mongo
# 插假数据
mongo $MONGODB_URI --eval 'db.ai_recommendations.insertOne({id:"r1",strategyId:"s1"})'
go run ./cmd/gateway &  # 看 log: "userId backfill applied" collection=ai_recommendations docs=1
curl -X POST localhost:3001/api/v1/admin/users/claim-legacy -b /tmp/c -H "X-Admin-Key: $K"  # → updated counts
```

**依赖**: 1.A.1（需要 admin user 概念）。

---

### Node 1.A.3 — Frontend: auth pages + middleware redirect + 用户菜单

**任务**: 新建 `client/app/(auth)/` route group (`/login`, `/register`,
`/accept-invite`)；写 Next.js middleware 在 `(dashboard)` 路由前校验
cookie 存在，未登录跳 `/login`；顶部 toolbar 加用户菜单（email + 角色 +
登出 + 切换主题）。`api-client.ts` 自动带 cookie (`credentials: 'include'`)。
`ApiError 401` 全局 handler 自动跳 `/login`。

**涉及文件**:
- 新建 `client/app/(auth)/layout.tsx`、`(auth)/login/page.tsx`、
  `(auth)/register/page.tsx`、`(auth)/accept-invite/page.tsx`
- 新建 `client/middleware.ts` — Next.js edge middleware，校验
  `Cookie: auth_token` 存在；未登录 + 不在白名单 → redirect `/login`
- 改 `client/data/api-client.ts` — 所有 fetch 加 `credentials: "include"`；
  `jsonOrThrow` 在 401/403 时 emit 一个全局事件（或直接 `location.href="/login"`）
- 新建 `client/components/user-menu.tsx`
- 改 `client/app/(dashboard)/layout.tsx` — header 区域插入 `<UserMenu>`
- 改 `client/data/type.d.ts` — 加 `TypeUser`
- 新建 `client/data/auth-client.ts` — `login()` / `register()` / `logout()` /
  `getMe()` / `acceptInvite()`
- 改 `client/app/page.tsx` — 不再直接 redirect `/dashboard`；先 `getMe()`
  成功才跳，失败跳 `/login`

**破坏性变更**: **yes** — 所有页面默认要求登录；dev 第一次跑必须先注册。

**验收命令**:
```bash
cd client && yarn lint && yarn build
# 手测
yarn dev &
# 浏览器访问 / → 跳 /login（未注册）
# 注册第一个 admin → 跳 /dashboard
# 登出 → 跳 /login；再访 /dashboard → 跳 /login
```

**依赖**: 1.A.1（后端 endpoints）。

---

### Node 1.A.4 — WS endpoint 接入 cookie auth

**任务**: `/ws` upgrade handshake 时读 cookie + 校验 JWT；未登录 → 拒绝
upgrade (403)。每个 topic subscription 校验 user 拥有资源 (strategyId /
accountId / studyId 等)。

**涉及文件**:
- 改 `gateway/internal/ws/handler.go`（或 `ws.NewHandler`）— 注入
  `AuthVerifier` 接口；upgrade 前调；失败 403
- 改 `gateway/internal/http/router.go` — 把 AuthVerifier 传进 WS handler
- 改 `gateway/internal/ws/hub.go` — subscription 路径校验 ownerId
  （从 echo context 拿到 userId，与 backtest_results.userId /
  option.userId / prediction_strategies.userId 比对）
- 新增 `gateway/internal/ws/auth_test.go`

**所有 repo 增改**: 无（只读 ownership 校验）。

**破坏性变更**: **no** —— 未登录的 WS 调用本来就是错的，行为变正确。

**验收命令**:
```bash
cd gateway && go test ./internal/ws/...
# 手测：浏览器开 console
new WebSocket('ws://localhost:3001/ws')  # 未登录 → close code 4403
# 登录后再开 → 正常
```

**依赖**: 1.A.1。

---

## Wave 2 — Design system + IA refactor (并行，依赖 Wave 1 完成)

Wave 1 完成后，前端整体能跑在 auth 之下。Wave 2 的 Node 都互相独立。

### Node 2.C.1 — Design tokens + dark mode + tailwind 升级

**任务**: 在 `tailwind.config.ts` 注册 spec §G1 的全部 tokens；
`app/globals.css` 加 `.theme-light` / `.theme-dark` CSS var 块；
`<ThemeToggle>` 写 `data-theme` 到 `<html>`；localStorage 持久化。

**涉及文件**:
- 改 `client/tailwind.config.ts` — 扩展 colors / spacing / fontFamily
- 改 `client/app/globals.css` — 声明 CSS vars + 等宽数字 utility class
- 新建 `client/components/theme-toggle.tsx`
- 新建 `client/data/use-theme.ts` — light/dark/system 三态 hook
- 改 `client/app/layout.tsx` — `<html data-theme>` SSR 注入（防闪烁）

**验收命令**:
```bash
cd client && yarn lint && yarn build
# 手测：切 dark，所有页面颜色随之，刷新不闪
```

**依赖**: 1.A.3（toolbar 槽位需先存在）。

---

### Node 2.C.2 — 核心组件库扩展 (Stat / Chart / FormField / Drawer / Toast / ConfirmDialog / Tabs / OrderBook / RiskMeter / Steps)

**任务**: 在 `client/components/` 下新建 spec §G1 列的 + 标记组件；
每个组件附 storybook-like 示例页 `client/app/(dashboard)/dev/components/`
（dev-only，rule 标 ✗ 在 sidebar 隐藏）。HeroUI 能复用就薄封装；
不能的（OrderBook、RiskMeter、Steps）从零写。

**涉及文件**:
- 新建 `client/components/{stat,chart,form-field,drawer,toast,confirm-dialog,tabs,order-book,risk-meter,steps,bottom-nav,command-palette}.tsx`
- 改 `client/components/data-table.tsx` — 加 `mobileLayout` prop
- 改 `client/components/status-badge.tsx` — 加 size + dot 变体
- 改 `client/components/page-header.tsx` — 加 tabs slot + sticky on mobile
- 新建 `client/app/(dashboard)/dev/components/page.tsx`

**验收命令**:
```bash
cd client && yarn lint && yarn build
# 手测：/dev/components 路由能渲染所有组件
```

**依赖**: 2.C.1（颜色 token 要先在）。

---

### Node 2.C.3 — Dashboard layout 壳 + sticky toolbar + 桌面 icon rail + bottom nav

**任务**: 改 `(dashboard)/layout.tsx`：顶部 sticky toolbar (breadcrumb +
cmd-k 按钮 + UserMenu + ThemeToggle)；sidebar 在 `md~lg` 收成 icon rail；
`<md` 时下方 sticky `<BottomNav>`。

**涉及文件**:
- 改 `client/app/(dashboard)/layout.tsx`
- 改 `client/components/sidebar.tsx` — 加 collapsed (icon-only) 模式
- 引入新 `<BottomNav>`（在 2.C.2 已建）
- 改 `client/components/mobile-header.tsx`（如有） — 与 BottomNav 协调

**验收命令**:
```bash
cd client && yarn build
# 手测：resize 浏览器到 1024 / 768 / 375，每个断点的导航都可用
```

**依赖**: 2.C.2 (BottomNav + ThemeToggle 等)、1.A.3 (UserMenu)。

---

### Node 2.C.4 — Command palette (cmd+k)

**任务**: 全局快捷键打开搜索 modal，索引所有 page + 高频动作 + 最近访问过
的资源。复用 2.C.2 的 `<Drawer>` 或新写 modal；cmd+k 在 web + macOS / ctrl+k
on win/linux。

**涉及文件**:
- 新建 `client/components/command-palette/index.tsx` + `index.ts`
  注册项（pages、actions）
- 新建 `client/data/use-recent-resources.ts` — localStorage 维护最近 5 个
  访问的 strategy/account/wallet/backtest id
- 改 `client/app/(dashboard)/layout.tsx` — 挂载全局 listener
- 各列表 / 详情页 useEffect 把当前资源 id 写入 use-recent-resources

**验收命令**:
```bash
cd client && yarn lint && yarn build
# 手测：任意页面按 cmd+k 出搜索框；搜 "halt" 跳 /settings/system；搜 "回测" 跳 /backtests
```

**依赖**: 2.C.2。

---

### Node 2.C.5 — 重构现有页面消费新设计系统（分批 PR）

**任务**: 不是一个 Node，而是 6 个 sub-Node 各负责一个 route，统一替换
为新 tokens / 新组件 / 三态规范：

- **2.C.5.a** — `/dashboard`、`/accounts*`、`/portfolio`
- **2.C.5.b** — `/strategies*`、`/option`(→`/strategies/new`)、`/recommendations*`
- **2.C.5.c** — `/backtests*`、`/markets`
- **2.C.5.d** — `/data-explorer/*`（5 子页）
- **2.C.5.e** — `/wallets*`、`/prediction/markets*`、`/prediction/strategies*`
- **2.C.5.f** — 老 `/admin*`（不动 endpoint，仅 UI 重排）— **将在 Wave 3
  的 Node 3.E.1 全部撤掉并迁去 `/settings/*`，所以 2.C.5.f 可以省略，留
  一个 noop 占位即可**

每个 sub-Node 涉及若干 `page.tsx` + 局部辅助组件；diff 控制在 ~300 行。
sub-Node 之间无依赖。

**验收命令**: 每个 sub-Node 跑 `yarn lint && yarn build`，浏览器逐页
肉眼检查；移动端 viewport 375×667 检查无横向滚动。

**依赖**: 2.C.1、2.C.2、2.C.3。

---

## Wave 3 — Settings hub + AI/data sources/trading menu

依赖 Wave 1 (auth role) + Wave 2 (design system) 全部完成。

### Node 3.E.1 — `/settings` IA + 6 子页框架 + 迁移 `/admin*` 内容

**任务**: 建 `client/app/(dashboard)/settings/` 路由树（spec §G3 6 大类）；
把 `/admin` 现有的 halt / portfolio-limits / admin-key 输入 移到
`/settings/system`；`/admin/ai` 内容迁到 `/settings/ai`；`/admin/audit`
保留独立页（链接从 `/settings/observability` 出）；旧 `/admin*` 路径 301
重定向到对应新路径。

**涉及文件**:
- 新建 `client/app/(dashboard)/settings/layout.tsx` (左二级 nav)
- 新建 `client/app/(dashboard)/settings/page.tsx`（索引/重定向 `/account`)
- 新建 `client/app/(dashboard)/settings/{account,system,ai,data-sources,trading,observability,deployment}/page.tsx`
- 把 `client/app/(dashboard)/admin/page.tsx` 主体逻辑搬到 `settings/system`
- 把 `client/app/(dashboard)/admin/ai/page.tsx` + `edit-modal.tsx` 搬到
  `settings/ai/`
- 改 `client/components/sidebar.tsx` — "管理" 组重命名为 "设置"，链接改
  `/settings*`
- 改 `client/middleware.ts`（Wave 1）— 加 `/admin` → `/settings` 301
- 改 `client/data/use-admin-key.ts` — 不变（仍 localStorage），但
  `/settings/system` 现在也可显示 admin 用户菜单的 role 而不依赖 admin-key
  做权限判定（admin role 是后端真值）

**破坏性变更**: **no** — 旧 URL 301 兼容。

**验收命令**:
```bash
cd client && yarn build
# 手测：访问 /admin → 跳 /settings/system；所有原 admin 操作仍可用
```

**依赖**: 1.A.1 (admin role)、2.C.5.f（可选，跳过）。

---

### Node 3.E.2 — 新 endpoint: `GET /api/v1/settings/system-info`

**任务**: 加 read-only 端点返回部署快照（不返 secret 值本身，只返"是否
配置"）：
```json
{
  "version": "<git-sha>", "buildAt": "...",
  "envFlags": {
    "MAINNET_TRADING_ENABLED": true, "POLYMARKET_TRADING_ENABLED": false,
    "FRED_API_KEY": true, "ETHERSCAN_API_KEY": false, "CRYPTOPANIC_TOKEN": false,
    "POLYGON_RPC_URL": true, "OTEL_EXPORTER_OTLP_ENDPOINT": false,
    "KEK_PROVIDER": "env", "REQUIRE_USER_ID": true, "ALLOWED_ORIGINS": [...]
  },
  "deps": {"mongo": "ok", "redis": "ok", "timescale": "ok", "quant": "ok"},
  "cronStatus": {"ingestEquitiesLastOk": "...", "optimizationDailyLastOk": "..."}
}
```

**涉及文件**:
- 新建 `gateway/internal/http/handlers/settings.go` + `settings_test.go`
- 改 `gateway/internal/http/router.go` — mount handler（admin only）
- 改 `gateway/cmd/gateway/main.go` — 暴露 build sha (ldflags `-X main.version=...`)

**新 endpoint**: `GET /api/v1/settings/system-info` (admin only)。

**验收命令**:
```bash
cd gateway && go test ./internal/http/handlers/...
curl -b /tmp/c localhost:3001/api/v1/settings/system-info | jq .deps
```

**依赖**: 1.A.1（admin role check）。

---

### Node 3.E.3 — `/settings/data-sources` + `/settings/trading` + `/settings/observability` + `/settings/deployment` 四页

**任务**: 4 个 admin-only readonly/部分可写页面消费 `system-info`
endpoint；mainnet token flow 这一段是写操作（request → confirm），仍走
现有 `/admin/mainnet/*` endpoints。

**涉及文件**:
- 新建 `client/app/(dashboard)/settings/data-sources/page.tsx`
- 新建 `client/app/(dashboard)/settings/trading/page.tsx`（mainnet
  request-token / confirm 流程组件）
- 新建 `client/app/(dashboard)/settings/observability/page.tsx`
- 新建 `client/app/(dashboard)/settings/deployment/page.tsx`
- 改 `client/data/api-client.ts` — 加 `getSettingsSystemInfo()`
- 改 `client/data/type.d.ts` — 加 `TypeSettingsSystemInfo`

**验收命令**:
```bash
cd client && yarn build
# 手测：四页都能渲染，secret 字段显示 badge 而非值
```

**依赖**: 3.E.1、3.E.2。

---

### Node 3.E.4 — `/settings/account` — 改密码 / 删账户 / 邀请成员

**任务**: 个人设置页 + 邀请其他成员的 UI；调用 1.A.1 的
`/auth/invite`、新建 `POST /auth/change-password`、`DELETE /auth/me`。

**涉及文件**:
- 新建 `client/app/(dashboard)/settings/account/page.tsx`
- 新建 `client/app/(dashboard)/settings/account/invite-modal.tsx`
- 改 `client/data/auth-client.ts` — 加 changePassword / deleteSelf / invite
- 改 `gateway/internal/http/handlers/auth.go` — 加
  `POST /api/v1/auth/change-password` + `DELETE /api/v1/auth/me`
- `auth_test.go` 覆盖

**新 endpoint**:
- `POST /api/v1/auth/change-password {oldPassword, newPassword}`
- `DELETE /api/v1/auth/me {password}` — 自删除（admin 不允许若为唯一 admin）

**验收命令**:
```bash
cd gateway && go test ./internal/http/handlers/...
cd client && yarn build
# 手测：登录 → 改密码 → 旧密码登录失败 / 新密码成功；admin 邀请 → 邮件 / URL 复制 → 第二个浏览器 accept → 登录
```

**依赖**: 1.A.1、3.E.1。

---

## Wave 4 — Deployment hardening

可以与 Wave 2/3 并行，但 `.env.example` 必须等 1.A.1 把 `AUTH_JWT_SECRET`
落地后再 commit 准确的字段。

### Node 4.F.1 — `.env.example` + `infra/scripts/check-env.sh` + healthcheck 完善

**任务**: 仓库根加 `.env.example` 列每个 env var（required / optional /
readonly）+ 默认值 + 生成命令；写 bash 脚本启动前校验；
gateway / quant healthcheck 扩展（deps 状态）。

**涉及文件**:
- 新建 `.env.example`
- 新建 `infra/scripts/check-env.sh`
- 改 `gateway/internal/http/router.go` — `/healthz` 扩展返回 deps map
- 改 `quant/src/quant/main.py` — 加 `/readyz` 检查 timescale / redis 连通
- 改 `infra/docker-compose.yml` — gateway/quant 加 healthcheck 段

**新 endpoint**: `/readyz` (quant)、`/healthz` 输出格式变更（向后兼容
`{status: "ok"}` 字段保留）。

**验收命令**:
```bash
bash infra/scripts/check-env.sh                      # 空 .env → 退出 1，列出缺失
cp .env.example .env && bash infra/scripts/check-env.sh  # → 0
docker compose -f infra/docker-compose.yml up -d --build
curl localhost:3001/healthz | jq .deps               # → {"mongo":"ok",...}
curl localhost:8000/readyz                            # → 200
```

**依赖**: 1.A.1（AUTH_JWT_SECRET 字段定型）。

---

### Node 4.F.2 — `infra/docker-compose.{dev,prod}.yml` overrides + Caddy reverse proxy

**任务**: 两个 override 文件 + Caddyfile；prod 模式只暴露 80/443，gateway /
quant / mongo / redis / timescale 全部内网；dev+ 模式启 hot reload。

**涉及文件**:
- 新建 `infra/docker-compose.dev.yml`
- 新建 `infra/docker-compose.prod.yml`
- 新建 `infra/caddy/Caddyfile`
- 新建 `infra/caddy/Dockerfile`（如需自定义）

**验收命令**:
```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml up -d
curl -k https://localhost/api/v1/auth/me            # Caddy 自签或 LetsEncrypt-staging
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up
# 改 gateway 代码 → air reload；改 quant 代码 → uvicorn reload
```

**依赖**: 4.F.1（healthcheck 完善后 compose 才能依赖正确）。

---

### Node 4.F.3 — 部署文档 `docs/deployment/{01-quickstart,02-production,03-troubleshooting}.md`

**任务**: 三篇 markdown，新部署者按 quickstart 5 分钟跑通；
production 篇覆盖备份 / 升级 / kill switch 演练；troubleshooting 列常见错误
（KEK 未配 / WS origin 403 / quant gRPC 拒绝连接 / mongo 索引重建慢等）。

**涉及文件**:
- 新建 `docs/deployment/01-quickstart.md`
- 新建 `docs/deployment/02-production.md`
- 新建 `docs/deployment/03-troubleshooting.md`
- 改 `README.md` — 顶部 "5 分钟启动" 段指向 quickstart

**验收命令**: 人工 review；让一个不熟悉项目的同事按 quickstart 跑一遍。

**依赖**: 4.F.1、4.F.2。

---

## Wave 5 — Mobile polish + 最后扫尾 (并行)

依赖 Wave 2、3 完成。

### Node 5.D.1 — Tables → cards on mobile + 全表单 mobile-friendly

**任务**: 落实 `DataTable.mobileLayout="card"` 到全部 list 页面；表单 input
高度 ≥44px + numeric keyboard；password input visibility toggle。

**涉及文件**:
- 改所有 list page（已经在 2.C.5 改过用 `<DataTable>` 后，这里只需传
  `mobileLayout` prop，单 prop 改动）
- 改 `client/components/form-field.tsx`（2.C.2 已建）— 加 input attrs
- 改 accounts/new / wallets/new / option / prediction/strategies/new / backtests/new
  五个表单页统一用 `<FormField>` 替换 raw `<input>`

**验收命令**:
```bash
yarn build
# Chrome DevTools 切 iPhone 12 viewport，逐表单逐列表过一遍
```

**依赖**: 2.C.2、2.C.5.\*。

---

### Node 5.D.2 — Chart mobile gestures + sticky tooltip

**任务**: lightweight-charts 容器加 long-press 触发 crosshair；timeframe
selector mobile 转 dropdown；tooltip overlay 改顶部固定位置。

**涉及文件**:
- 改 `client/components/chart.tsx`（2.C.2）— 媒体查询切换
- 改 `client/app/(dashboard)/markets/chart.tsx`、`backtests/[id]/equity-chart.tsx`、
  `strategies/[id]/equity-chart-live.tsx` — 使用新 chart shell

**验收命令**:
```bash
yarn build
# iPhone DevTools：长按图表 → crosshair 出现；切 1m/5m/1h 用 dropdown
```

**依赖**: 2.C.2。

---

### Node 5.D.3 — A11y + 性能扫尾

**任务**: 全站 aria-label 补漏（Sidebar 已有，扩展到 BottomNav、UserMenu、
ConfirmDialog、CommandPalette）；run lighthouse audit；首屏 JS bundle <
200KB gzipped（Next.js code splitting check）。

**涉及文件**:
- 各组件 a11y 补丁（少量改动）
- `client/next.config.mjs` — `swcMinify`（默认开了）+ `productionBrowserSourceMaps:
  false`；`experimental.optimizePackageImports` 配 `@heroui/react`

**验收命令**:
```bash
cd client && yarn build
# lighthouse: a11y >= 95; perf >= 80
npx @next/bundle-analyzer  # 首屏 chunk < 200KB gz
```

**依赖**: 全部前端 Node 完成后扫尾。

---

## 依赖图 (ASCII)

```
Wave 1 (Auth foundation, 顺序)
                                                                
   1.A.1 (gateway auth + JWT)                                   
       │                                                        
       ├──> 1.A.2 (mongo userId migration + claim-legacy)       
       │                                                        
       ├──> 1.A.3 (frontend auth pages + middleware)            
       │       │                                                
       │       └──> 1.A.4 (WS cookie auth)                      
       │                                                        
       ▼                                                        
─────────────────────────────────────────────────────────       
Wave 2 (Design system, 并行)                                    
                                                                
   2.C.1 (tokens + dark mode)                                   
       │                                                        
       └─> 2.C.2 (component lib)                                
              │                                                 
              ├─> 2.C.3 (layout shell + bottom nav)             
              │                                                 
              ├─> 2.C.4 (cmd palette)                           
              │                                                 
              └─> 2.C.5.{a..e} (5 个并行子节点, 重构页面)       
                                                                
─────────────────────────────────────────────────────────       
Wave 3 (Settings hub) ─── 依赖 Wave 1 + Wave 2 (2.C.3)          
                                                                
   3.E.1 (/settings 框架 + 迁移 /admin)                         
       │                                                        
       ├─> 3.E.2 (settings/system-info endpoint)                
       │       │                                                
       │       └─> 3.E.3 (4 个 admin readonly 页)               
       │                                                        
       └─> 3.E.4 (settings/account + 邀请)                      
                                                                
─────────────────────────────────────────────────────────       
Wave 4 (Deployment, 与 Wave 2/3 并行可行)                      
                                                                
   4.F.1 (.env.example + healthcheck)                           
       │                                                        
       ├─> 4.F.2 (prod/dev compose + Caddy)                     
       │                                                        
       └─> 4.F.3 (deployment 文档)                              
                                                                
─────────────────────────────────────────────────────────       
Wave 5 (Mobile polish, 收尾)                                    
                                                                
   5.D.1 (tables → cards + forms)                               
   5.D.2 (chart gestures)                                       
   5.D.3 (a11y + perf 扫尾)                                     
```

---

## 自检 (Checklist)

### 6 大目标覆盖矩阵

| 目标 | 主要 Node | 辅助 Node |
|---|---|---|
| G1 美观（trading-platform UI）        | 2.C.1, 2.C.2, 2.C.3, 2.C.5.* | 2.C.4 (cmd-k) |
| G2 可用性（所有页面可触达）          | 2.C.3 (sidebar/bottom-nav), 2.C.4 (cmd-k), 2.C.5.* | 3.E.1 (/settings 整合) |
| G3 易配置（AI + 所有 env 进 UI）     | 3.E.1, 3.E.2, 3.E.3, 3.E.4 | (无) |
| G4 多账户性（auth + 单 owner 模式）  | 1.A.1, 1.A.2, 1.A.3, 1.A.4 | 3.E.4 (邀请) |
| G5 移动端                            | 2.C.3, 2.C.5.* (列表), 5.D.1, 5.D.2 | 5.D.3 (a11y) |
| G6 易部署                            | 4.F.1, 4.F.2, 4.F.3 | (无) |

### 依赖循环检查
- Wave 1 内部线性 (`1.A.1 → 1.A.2 / 1.A.3 / 1.A.4`)，无循环。
- Wave 2 内 `2.C.1 → 2.C.2 → {2.C.3, 2.C.4, 2.C.5.*}`，DAG。
- Wave 3 内 `3.E.1 → 3.E.2 → 3.E.3` + `3.E.1 → 3.E.4`，DAG。
- Wave 4 内 `4.F.1 → 4.F.2 → 4.F.3`，DAG。
- Wave 5 收尾，全部下游。
- 跨 wave 依赖单向 (Wave N → Wave N+k)；无回环。

### 验收命令机器可跑
- 后端 Node 都给 `go test` / `curl`；前端给 `yarn build` + 浏览器手测项。
- 4.F.1 给 docker compose up 后 curl healthz。
- 5.D.* 给 Chrome DevTools mobile viewport 描述，可用 Playwright 写
  e2e（本计划暂不强制写 e2e；建议在 5.D.3 加入）。

### Auth 迁移破坏性变更
- **核心破坏点**: `AUTH_JWT_SECRET` 必填；旧部署不设 → 启动失败。
- **数据安全**: 1.A.2 的 backfill 是 idempotent；`claim-legacy` 是
  admin 显式触发；不破坏既有数据。生产升级步骤：
  1. **先备份** mongo (`infra/scripts/backup-mongo.sh` 已存在)
  2. 写 `AUTH_JWT_SECRET` 到 `.env`，部署 1.A.1 + 1.A.2 后的新镜像
  3. 启动后 log 应出现 "no users yet; first /api/v1/auth/register call
     becomes admin"
  4. UI 访问 `/login` → 跳 `/register` → 用 owner email + password 注册
  5. `/settings/account` 点 "迁移历史数据" → 全部 `userId="default"` 改写
  6. 验证 `/strategies` / `/accounts` 等列表回来
- **回滚**: 删 `users` 集合 + 取消 `AUTH_JWT_SECRET` env → 重启回到旧版
  本可读旧数据（`userId="default"` 还在）。

---

## 风险点 (执行 Plan 时重点关注)

1. **JWT secret 处理失误 → 全员退登**
   `AUTH_JWT_SECRET` 改值会让所有现有 cookie 立刻失效。Plan 内 production
   配置必须 commit 一份固定值到 secret store；轮换 secret 走 grace-period
   (双 secret 校验) — 本次 Plan 不实现轮换，但要在 02-production.md 写明
   "改 secret = 全员重登"。

2. **`claim-legacy` 选错 admin → 数据归错人**
   当 `users` 集合有多个用户时，调用 `claim-legacy` 没有 user 选择 UI，
   会默认归到当前调用者（admin）。Plan 内 1.A.2 / 3.E.4 需明确：仅在
   "唯一 admin" 状态下展示按钮；多 admin 出现后这个迁移按钮自动隐藏，强
   制走 mongo 手工脚本 — 这避免一个 admin 把另一个 admin 的旧数据吞掉。

3. **WS cookie auth 与 CORS 互相打架**
   `(/ws)` 在跨域时浏览器不带 cookie；现有 `ALLOWED_ORIGINS` 已经为 CORS
   提供 allowlist 但 WS path 是 OriginPatterns。1.A.4 必须在 CORS 严格模
   式下手测 — 否则 production 用 nginx 反代 + 不同子域时 WS 会静默断连，
   browser 体感是 "实时面板永远在 loading"。4.F.2 的 Caddy 配置必须把 ws
   path 反代到 gateway 且不剥 cookie。

---

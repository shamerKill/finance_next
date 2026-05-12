# finance_next Platform Rewrite — Design Spec

> 2026-05-12 · 作者: PM + Architect 协作稿
> 目标读者: 后续执行 Plan 的 subagents、reviewing humans

本文档描述对 `finance_next` 仓库的一次"重构 + 体验升级"。范围限定在
单用户 owner 模式的交易平台 UI、配置中心、auth、移动端、部署六个领域。
**不写代码**；只定义形态、约束、验收线。

---

## 0. 现状速描（每点一句）

- **信息架构**：`client/app/(dashboard)/` 一个固定 route group，sidebar 左 +
  `<main>` 右；移动端有 hamburger drawer。导航分 4 组：运营 / 策略 / 数据 /
  管理。
- **设计语言**：HeroUI 2.8 + Tailwind 4；primary 颜色单调（`#7EE7FC`），无
  dark mode，无 design tokens 显式抽离；通用组件已抽出
  (`Section/PageHeader/DataTable/StatusBadge/EmptyState/Callout`) 但 spacing / 字号
  使用 Tailwind 默认值。
- **配置散布**：`gateway/.env`(MONGODB_URI / ENCRYPTION_KEY / ADMIN_KEY /
  REDIS_URL / TIMESCALE_DSN / QUANT_GRPC_ADDR / MAINNET_TRADING_ENABLED /
  POLYMARKET_TRADING_ENABLED / POLYGON_RPC_URL / KEK_PROVIDER + ~10 个 phase-7
  observability) + `quant/.env`(ANTHROPIC/OPENAI 密钥 + 8 个 AI 预算/cron) +
  Mongo `system_state` / `portfolio_limits` 集合 + Mongo `ai_config` (gateway
  PUT 写入) + 浏览器 localStorage (`finance_next_admin_key` /
  `finance_next_user_id`)。**目前 UI 能改的只有：admin key（本地存储）、
  user id（本地存储）、portfolio limits、ai config、kill switch reason**。
- **Auth 现状**：**没有 auth**。`X-User-Id` header trust-the-frontend；
  `WithUserID` middleware + 大部分 repo 的 `userId` 字段 + boot 时 idempotent
  backfill (`userId="default"`) 已就位 (commit `7df665b`)，但鉴权这一道闸完全
  缺失，整个 `/api/v1/*` 任何人都能 hit；`/admin/*` 仅靠 `X-Admin-Key` 静态
  header；admin 拿到 key 就能跨所有 user 操作。
- **移动端**：sidebar drawer + 一个 `MobileHeader` (commit `9a9b333`)，但
  表格、表单仍是桌面布局；图表 (lightweight-charts) 无 touch 处理；多数页面
  在 <640px 触发横向滚动。
- **部署**：`infra/docker-compose.yml` 一键起 5 服务 (mongo / redis /
  timescale / gateway / quant)；env 校验只在 Go 进程内做 (`MONGODB_URI` /
  `ENCRYPTION_KEY`)；`/healthz` 在 gateway 有，quant 在 FastAPI :8000 有；
  **缺**：production override compose、env 模板生成器、prod / dev 区分、
  端口暴露策略说明、HTTPS 反代示例、运维 README。

---

## 1. 六大目标的具体落地形态

### G1 美观 — 交易平台风格 UI

**设计 Tokens（写到 `tailwind.config.ts` + `app/globals.css` 的 CSS 变量）**

| Token 类别 | Light | Dark | 用途 |
|---|---|---|---|
| `--bg-canvas`        | `#FAFAFA` | `#0B0E11`           | 页面底色（Binance dark 同款）|
| `--bg-surface`       | `#FFFFFF` | `#161A1E`           | 卡片 / table 行 |
| `--bg-surface-2`     | `#F5F5F5` | `#1E2329`           | hover / striped row |
| `--border-default`   | `#E5E7EB` | `#2B3139`           | 默认边框 |
| `--text-primary`     | `#111111` | `#EAECEF`           | 主文 |
| `--text-secondary`   | `#5E6673` | `#848E9C`           | 次文（标签、单位）|
| `--text-tertiary`    | `#929AA5` | `#5E6673`           | 提示、placeholder |
| `--accent-up` (BUY/profit)   | `#0ECB81` | `#0ECB81` | 拉绿（Binance 同色）|
| `--accent-down` (SELL/loss)  | `#F6465D` | `#F6465D` | 拉红 |
| `--accent-warning`   | `#F0B90B` | `#F0B90B`           | 杠杆 / mainnet warning |
| `--accent-info` (current primary, 调整)| `#1FC7D4` | `#1FC7D4` | 高亮 / 链接 |
| `--brand-primary`    | `#7EE7FC` | `#7EE7FC`           | 现有 HeroUI primary 不动，按钮主色 |

**字号 / 行高**（继承 Tailwind 但锁定一组语义）
- `text-mono-sm` (12px / 16): 数字、地址、id、tx hash
- `text-mono-md` (14px / 20): 表格价格 / 数量
- `text-mono-lg` (20px / 28): KPI 卡顶部数字
- `text-mono-xl` (32px / 40): dashboard 顶部 PnL / total balance
- 中文用 Inter + 系统中文回退；数字用 `font-feature-settings: "tnum"` 等宽数字

**间距 stride**: 4 / 8 / 12 / 16 / 24 / 32 / 48 px（即 `space-{1,2,3,4,6,8,12}`），
栅格容器 `max-w-screen-xl mx-auto px-4 lg:px-6`。

**核心组件清单（全部已存在的标 ✓，新增的标 +）**

| 名字 | 状态 | 描述 |
|---|---|---|
| `Card` / `Section`              | ✓ refactor | 圆角 8px，1px border + shadow-sm，title 行 14px secondary，body 紧贴 |
| `Stat` (KPI card)               | + | label / value / delta-with-arrow / sparkline 槽 |
| `DataTable`                     | ✓ refactor | 加 sticky header / row-hover / 数字右对齐 / 等宽数字 / 移动端转 card list |
| `OrderBook` (bid/ask ladder)    | + | 红绿两色柱 + price 等宽，用于 `/prediction/markets/[id]` |
| `Chart` shell                   | + | lightweight-charts 包装：legend / timeframe tabs / cursor crosshair / 自适应 dark 主题 |
| `RiskMeter`                     | + | 横条 + 三档颜色，用于 portfolio limits / AI budget |
| `StatusBadge`                   | ✓ refactor | 加 size / dot 变体 |
| `Callout`                       | ✓ | 不动 |
| `EmptyState`                    | ✓ | 不动 |
| `KillSwitchBanner`              | ✓ refactor | 始终顶置，加倒计时 / 操作者 / reason |
| `CommandPalette`                | + | `cmd+k` 全局，索引所有页面 + 最近操作 + admin 动作（halt/resume） |
| `ConfirmDialog`                 | + | 二次确认（halt、删除策略、approve recommendation、mainnet confirm） |
| `FormField`                     | + | label / hint / error 三槽 + input 插槽；统一所有表单（accounts/option/wallets/backtests/new） |
| `Tabs` (segmented)              | + | 用于 `/strategies/[id]` 详情 (KPI / params / orders / AI / backtests) |
| `Drawer` (right-side)           | + | 移动端 + 桌面同款；orderbook 详情 / 推荐 detail 内嵌进入 |
| `Toast`                         | + | 操作反馈（保存成功 / approve 完成）；目前用 alert / inline |
| `ThemeToggle`                   | + | dark/light/system 三态，写入 localStorage |
| `PageHeader`                    | ✓ refactor | 加 tabs slot + breadcrumb；移动端 sticky |
| `BottomNav` (mobile)            | + | 5 主入口固定底部（dashboard / strategies / data / portfolio / more） |

**Dashboard 布局规范**
- 桌面 (≥ lg, 1024px+): 左 `<aside>` 240px 固定 + `<main>` 流式；max-w-screen-xl 容器；
  顶部 sticky `<KillSwitchBanner>` + 副 toolbar (面包屑 + 当前 user + cmd+k 按钮 +
  theme toggle + logout)。
- 平板 (md, 768~1023): sidebar 转 collapsed icon-only rail (60px)；副 toolbar 保留。
- 手机 (< md): 顶部 `<MobileHeader>` (hamburger 打开 drawer，复用现有) + 底部
  `<BottomNav>` (`/dashboard`、`/strategies`、`/data-explorer`、`/portfolio`、`/more`)；
  `/more` 是一个聚合页，列出所有 sidebar group。

**参考竞品借鉴点**
- **Binance**: KPI 顶部条 (Total Balance / 24h PnL / 30d / Available)；
  上涨/下跌色 `#0ECB81` / `#F6465D`；表格行高 36px、等宽数字。
- **OKX**: 左侧 collapsable icon rail；右下角 floating action button (FAB)
  for 创建新策略 / 新账户。
- **TradingView**: chart legend 跟手十字线 + OHLC overlay；timeframe segmented
  control；Lightweight-charts 已经在用，加 crosshair tooltip + auto theme。
- **Polymarket**: market card 列表用 outcome 进度条 (YES/NO) 直观可见。

---

### G2 可用性 — 全功能可触达

**现存页面清单 + 入口策略**（最终所有页面都有至少 2 个 entry：sidebar +
cmd-palette；高频上下文链接列在第三列）

| 路径 | 描述 | Sidebar 组 | 上下文链接 |
|---|---|---|---|
| `/dashboard`                 | 6 卡总览                            | 运营            | logo 点击 / "/" 重定向 |
| `/accounts`                  | 账户列表                            | 运营            | dashboard "账户" 卡跳转 |
| `/accounts/new`              | 新建账户                            | -               | `/accounts` 右上 "添加" |
| `/accounts/[id]`             | 账户详情 + WS event 流              | -               | `/accounts` 行点击 |
| `/wallets`                   | Polygon 钱包列表                    | 运营            | `/prediction/strategies` live toggle 步骤 |
| `/wallets/new`               | 新建钱包                            | -               | `/wallets` 右上 |
| `/wallets/[id]`              | 钱包详情 + balance/approve          | -               | `/wallets` 行点击 |
| `/portfolio`                 | 跨账户 USD 汇总                     | 运营            | dashboard "总市值" 卡 |
| `/strategies`                | 策略列表（含 Live 徽章）            | 策略            | dashboard 链接 |
| `/strategies/[id]`           | 策略详情 (Tabs)                    | -               | `/strategies` 行点击 |
| `/option`                    | **重命名 → `/strategies/new`** 兼容 | 策略 "新建策略" | `/strategies` 右上 FAB |
| `/recommendations`           | AI 推荐列表 + 待审 badge            | 策略            | sidebar badge + dashboard 卡 |
| `/recommendations/[id]`      | 推荐详情 + diff + approve          | -               | 列表行 |
| `/backtests`                 | 回测列表                            | 策略            | sidebar |
| `/backtests/new`             | 新建回测                            | -               | `/strategies/[id]` "回测此策略" 按钮 + `/backtests` 右上 |
| `/backtests/[id]`            | 回测详情 + equity / trades + WS    | -               | 列表行 |
| `/markets`                   | OHLCV chart                         | 数据            | dashboard "查看行情" |
| `/data-explorer` (索引)      | 5 路数据源入口                      | 数据            | sidebar |
| `/data-explorer/equities`    | 股票 OHLCV                          | -               | 索引页 |
| `/data-explorer/futures`     | 期货 OHLCV                          | -               | 索引页 |
| `/data-explorer/macro`       | 宏观指标                            | -               | 索引页 |
| `/data-explorer/onchain`     | 链上指标                            | -               | 索引页 |
| `/data-explorer/news`        | 新闻流                              | -               | 索引页 |
| `/prediction/markets`        | Polymarket 市场列表                 | 数据            | sidebar |
| `/prediction/markets/[id]`   | 市场详情 (orderbook + trades)       | -               | 行点击 |
| `/prediction/strategies`     | 预测策略列表                        | 数据            | sidebar |
| `/prediction/strategies/new` | 新建                                | -               | 列表右上 |
| `/prediction/strategies/[id]`| 详情                                | -               | 列表行 |
| `/admin` (重组 → `/settings`)| 见 G3                              | 管理            | sidebar + toolbar 齿轮图标 |
| `/admin/ai`                  | AI 配置（合并进 /settings/ai）     | 管理            | sidebar |
| `/admin/audit`               | 审计日志                            | 管理            | sidebar |
| `/login` (+ `/register`)     | **新增**，见 G4                    | -               | 未登录任意路由都重定向到 `/login` |
| `/more` (mobile)             | **新增**，所有 sidebar group 平铺   | -               | bottom nav |

**新增 cmd-palette**（`cmd+k`）索引：
- 所有上面这些 page (label + path)
- 高频动作：halt / resume / 新建策略 / 新建账户 / 抓取行情 / 触发 AI 优化
- 最近 5 个访问过的策略 / 账户 / 钱包

**空 / 错 / 加载 三态规范**
- **空态**：使用 `<EmptyState>`，必须给一个 primary CTA（"添加第一个账户" / "前往设置"）
  和一行解释文字。禁止显示空白页或纯 "暂无数据"。
- **加载态**：列表页用 skeleton（卡片骨架 + 表格行骨架）；详情页用顶部 progress bar；
  详情子区块用 `<Section loading>` 自带 spinner；禁止使用全屏 loading。
- **错误态**：`<ApiErrorView>` 已存在，需补齐：401/403 → "登录已失效，请重新登录"
  按钮（清 cookie + 跳 `/login`）；503 → "服务暂时不可用，正在重试" + 倒计时；
  404 → "资源不存在或被删除" + 返回列表按钮。
- 全局错误边界 (`error.tsx`) 已经在 dashboard route group 下，需为
  `(auth)` route group 单独添加一个简洁版。

---

### G3 易配置性 — 全部配置进 UI

**重组**：现在的 `/admin` + `/admin/ai` + 部分散落在 `/strategies/[id]`
风控编辑 → 统一进 **`/settings`** 一棵菜单树。一级 6 大类：

```
/settings
├── /settings/account              个人 (登录用户)
│   ├── 用户名 / 邮箱               (input, write: users coll)
│   ├── 修改密码                    (form, write: users coll)
│   ├── 切换主题                    (toggle, localStorage)
│   ├── 语言 (zh-CN / en)           (select, localStorage)
│   └── 删除账户                    (confirm, danger)
│
├── /settings/system               系统 (admin only)
│   ├── 紧急停机开关                (toggle + reason, /admin/halt|resume)
│   ├── 跨策略限额                  (form, /admin/portfolio-limits)
│   │   ├── maxOpenNotionalUsd      (input)
│   │   ├── maxOpenPositionsCount   (input)
│   │   └── maxDailyLossUsd         (input)
│   └── 当前系统状态                (readonly card)
│
├── /settings/ai                   AI 配置 (admin only) — 替换 /admin/ai
│   ├── 模型族                      (radio: claude/openai, /admin/ai/config)
│   ├── 主模型 / refine 模型        (text input, 同上)
│   ├── base URL                    (text input, 同上)
│   ├── 每 study 预算 / 每日预算    (input, 同上)
│   ├── 查找窗口 (lookbackDays)     (input, 同上)
│   ├── ANTHROPIC_API_KEY           (readonly + status badge, env-only — 写法: 在 quant/.env 设 + 重启)
│   ├── OPENAI_API_KEY              (readonly + status badge, 同上)
│   └── System Prompts              (readonly, from quant GetAIConfig RPC)
│
├── /settings/data-sources         数据源 keys (admin only) — 新增
│   ├── FRED_API_KEY                (readonly + 状态 badge, env-only)
│   ├── ETHERSCAN_API_KEY           (readonly + 状态 badge, env-only)
│   ├── CRYPTOPANIC_TOKEN           (readonly + 状态 badge, env-only)
│   ├── POLYGON_API_KEY (paid stub) (readonly + 状态 badge, env-only)
│   ├── GLASSNODE_API_KEY (stub)    (readonly + 状态 badge, env-only)
│   ├── NANSEN_API_KEY (stub)       (readonly + 状态 badge, env-only)
│   ├── AI_CONTEXT_INCLUDE_EXTENDED (toggle, /admin/ai/config 扩展)
│   └── 数据源状态自检卡            (readonly, 各 ingest cron 上次成功时间)
│
├── /settings/trading              交易开关 (admin only) — 新增
│   ├── MAINNET_TRADING_ENABLED     (readonly + status badge, env-only)
│   ├── POLYMARKET_TRADING_ENABLED  (readonly + status badge, env-only)
│   ├── 主网启用流程                (action card: request-token → 复制 stderr token → confirm)
│   ├── 当前 mainnet 状态           (readonly: envEnabled / mainnetAllowed / expiresAt)
│   └── POLYGON_RPC_URL             (readonly + 状态 badge, env-only)
│
├── /settings/observability        监控 (admin only) — 新增
│   ├── /metrics endpoint           (readonly, "scrape me")
│   ├── /healthz status             (readonly auto-poll)
│   ├── OTEL_EXPORTER_OTLP_ENDPOINT (readonly, env-only)
│   ├── 审计日志                    (link to /admin/audit, 保留独立页)
│   └── 后台任务上次运行            (readonly: ingest cron / optimization cron)
│
└── /settings/deployment           部署信息 (admin only) — 新增 readonly 一页
    ├── 当前版本 / git sha / build ts (readonly)
    ├── 已连接服务: mongo / redis / timescale / quant
    │   每项 ✓/✗ + last-checked-at (readonly poll)
    ├── KEK provider                (readonly: env-only)
    ├── ALLOWED_ORIGINS             (readonly: env-only)
    └── REQUIRE_USER_ID              (readonly: env-only)
```

**编辑形态语义**
- `input` / `toggle` / `select` / `radio`：UI 可改，PUT 到对应 endpoint。
- `secret`: never displayed; UI 仅显示 "已配置" / "未配置" badge + 写入方法
  提示（"编辑 `gateway/.env` 后重启" / "编辑 `quant/.env` 后重启 quant"）。
- `readonly`: 显示当前值，副标题写 "环境变量，需重启服务"；不可编辑。

**为什么不让 UI 改全部 env vars**：env vars 决定 master KEK、连接串、admin
key 等"信任根"信息，让 UI 改就把 RCE 漏洞放大。所以 secret class **永远
不能从 UI 改**，只能显示状态 + 文档指引。新增的 `settings.ts` collection
存可 UI 改的覆盖项（AI config 已经走这条路）。

**新 endpoint 列表（gateway 新加）**
- `GET /api/v1/settings/system-info` — 一次性返回所有 readonly env 的 "是否
  已配置" / 连接状态 / 版本号（不返回 secret 本身），供 `/settings/deployment`、
  `/settings/trading`、`/settings/data-sources` 共用。

---

### G4 多账户性 — 单用户登录注册

**选型决定**: **JWT (HS256) + httpOnly Secure SameSite=Lax cookie**，单租户
owner 模式，**首启动 bootstrap 一个 admin 用户，后续 admin 通过 UI 邀请**。

**为什么这套**
- httpOnly cookie 拒 JS 读 = 防 XSS 偷 token；SameSite=Lax 拒第三方表单 = 防
  CSRF（POST 同源足够；admin 端点已经有 `X-Admin-Key` 二次锁）。
- HS256 + env secret = 不引入 RS256 公私钥管理负担，匹配 owner 模式（不会
  跨服务校验 token）。
- 单租户：拒绝 SaaS / 多组织复杂度（参考 §2 不做什么）。

**用户模型** (Mongo `users` 集合)
```
{
  _id: ObjectID,
  id: "<hex>",               // 用作 userId (覆盖现 "default" 字面量)
  email: "...",              // unique, 登录用户名
  passwordHash: "<argon2id>",
  role: "admin" | "member",  // 仅 admin 能进 /settings/system|ai|trading|...
  createdAt, updatedAt,
  lastLoginAt,
  invitedBy?: "<userId>",
}
```

**Bootstrap 流程**
1. `runUserIDBackfills`（已存在）保持不动，继续把缺 userId 的旧文档写
   "default"。
2. 启动时 gateway 检查 `users` 集合是否为空。
   - 空 → log "no users yet; first /api/v1/auth/register call becomes admin"。
   - 非空 → 拒绝任何 `/auth/register` 调用（403），admin 通过 `POST
     /auth/invite` 创建邀请链接。
3. 启动时把所有 `userId="default"` 的旧文档保留原值；首个 admin 注册成功
   后，提供一个 admin-only 操作 `POST /api/v1/admin/users/claim-legacy`
   把所有 `userId="default"` 改成该 admin 的 userId（idempotent，一键迁移）。

**注册 / 登录 / 登出流程**
- `POST /api/v1/auth/register {email, password}` — 仅在 `users` 为空或带
  invitation token 时允许；写 argon2id hash；返回 201 + Set-Cookie。
- `POST /api/v1/auth/login {email, password}` — 校验 hash；返回 200 +
  Set-Cookie；rate-limit 5 次/分钟/IP（IP 是 reverse proxy `X-Forwarded-For`，
  没有就 RemoteAddr）。
- `POST /api/v1/auth/logout` — clear cookie + 把 jti 写黑名单 Redis (TTL
  = 剩余 token 过期时间)。
- `GET /api/v1/auth/me` — 返回当前 user，401 = 未登录。
- `POST /api/v1/auth/invite` (admin only) — 生成 24h TTL 邀请 token，返回
  URL，admin 复制给被邀请者；写 `invitations` 集合。
- `POST /api/v1/auth/accept-invite {token, password}` — 验邀请 → 创建 user
  → 标记 invitation used。

**Middleware 改造**
- 新建 `gateway/internal/http/middleware/auth.go::WithAuth(jwtSecret)`：
  - 读 cookie → 验签 → 反序列化 claims (sub / role / jti / exp)。
  - 检查 jti 是否在 logout 黑名单 (Redis `SISMEMBER auth:revoked`)。
  - 把 `userId = sub` 写入 echo context，**覆盖** `WithUserID` 的 header
    回退值（header 仍接受，作为内部 system-to-system 调用预留）。
  - 未登录 + 路由不在白名单 → 401。
- 白名单：`/healthz` / `/metrics` / `/api/v1/auth/register` /
  `/api/v1/auth/login` / `/api/v1/auth/accept-invite` / `/ws` (WS 自己有
  cookie 校验，见下)。
- WS endpoint (`/ws`)：handshake 时读同一个 cookie；未登录 → 拒 upgrade。

**前端改造**
- 新 route group `client/app/(auth)/`：`/login` + `/register` + `/accept-invite`，
  独立 layout（无 sidebar）。
- `next.config.mjs` 加 middleware 或在 `(dashboard)/layout.tsx` 加 server-side
  `auth()` 检查 (`cookies()` API)，未登录 → `redirect("/login")`。
- 顶部 toolbar 新增用户菜单 (email + role + 登出 + 主题切换)。

**Mongo 迁移策略**（生产已有数据怎么办）
- **每个 user-scoped collection** 都已经有 `userId` 字段（除了 backtest_results /
  audit / exchange_meta —— 这三个不需要绑定 user）。下表汇总：

| 集合 | 已有 userId? | 迁移动作 |
|---|---|---|
| options                 | ✓ | `userId="default"` → `userId="<first-admin-id>"` 经 `claim-legacy` |
| accounts                | ✓ | 同上 |
| order_log               | ✓ | 同上 |
| polygon_wallets         | ✓ | 同上 |
| prediction_strategies   | ✓ | 同上 |
| prediction_orders       | ✓ | 同上 |
| ai_recommendations      | ✗ | **plan A2**: 加 `userId` + boot backfill (源 strategy 推断) |
| optimization_runs       | ✗ | **plan A2**: 加 `userId` + boot backfill |
| system_state            | n/a (单 doc) | 不动 |
| portfolio_limits        | ✓ (userId) | 现是 per-user，OK |
| audit                   | actor 字段已存 | 不动 |
| backtest_results        | ✗ | **plan A2**: 加 `userId` + backfill |
| exchange_meta           | n/a | 全局，不动 |
| users (新)              | -   | 新建 |
| invitations (新)        | -   | 新建 |

- **运行节奏**: 升级时 gateway 启动 → 检测 `users` 集合 → 空 → 后端
  /api/v1/auth/register 接受第一个调用 → 该用户得 role=admin →
  admin 进 `/settings/account` 看到 "迁移历史数据" 按钮 →
  点击触发 `POST /admin/users/claim-legacy` → 所有 `userId="default"` 改写。
- **失败回滚**: `claim-legacy` 是 idempotent + 单事务（最坏只 partial）；
  不破坏数据，可重跑。

**JWT 配置 env (新加)**
- `AUTH_JWT_SECRET` — 64 hex / 32 byte (与 `ENCRYPTION_KEY` 同形态)；
  缺失 → gateway 启动失败（fail-fast，避免无 auth 上线）。
- `AUTH_JWT_TTL_SECONDS` — default `86400` (24h)。
- `AUTH_COOKIE_DOMAIN` — 可选，多子域共享时用；默认空 = 同源。
- `AUTH_COOKIE_SECURE` — default `true`；dev 可置 `false`。

---

### G5 移动端友好

**断点**（沿用 tailwind 默认）：
- `sm` 640px / `md` 768px / `lg` 1024px / `xl` 1280px / `2xl` 1536px。
- 主分界：`< md` → mobile；`md ~ lg` → tablet (icon rail)；`≥ lg` → desktop。

**导航**
- `< md`: 顶部 sticky `<MobileHeader>` (现存) + 底部固定 `<BottomNav>` (5 主入口，
  新增)。Drawer 仍存在但只通过 hamburger 召唤，覆盖 `<BottomNav>` 之外的次级
  导航。
- `md ~ lg`: 左侧 icon-only rail (60px)，label 在 hover tooltip；点击 →
  `<main>` 流式。
- `≥ lg`: 现状不动 (240px sidebar with labels)。

**表格 → 卡片转换原则**
- 列表页 `<DataTable>` 在 `< md` 自动转 vertical card list：每行变一个
  card，主字段顶上，次字段用 `<dl>` 两列；操作按钮放右上角 ellipsis 菜单
  里。
- 详情页的二级 list (orders / trades) 同上。
- 实现路径：扩展 `<DataTable>` 接受 `mobileLayout?: "card" | "scroll"`
  prop；默认 "card"。强制 `scroll` 仅用于行情 ladder（OrderBook 本身就是
  纵向 dense）。

**表单**
- input 最小高度 44px (touch target)；label 永远在上方而非左侧；
  number input 调用 mobile numeric keyboard (`inputMode="decimal"`)；
  password input 加 visibility toggle。
- 分组用 `<Section>` 包裹；多步表单（如新建账户三步）用 `<Steps>` 组件（新增）。

**图表移动端处理**
- lightweight-charts 自带 touch 拖拽 / 双指缩放；需补：
  - cursor crosshair 改为 long-press 触发（避免误触）。
  - timeframe 切换从 segmented control 改 dropdown（节省横向空间）。
  - tooltip 浮在图表顶部固定位置，而非跟随光标（移动端跟随光标会被手指遮挡）。
- chart 容器 `aspect-ratio: 16/9` mobile / `auto` desktop。

---

### G6 易部署

**目标**: `cp .env.example .env && docker compose up -d` 走通；任何 env
缺失给清晰报错。

**改动清单**
1. **`.env.example`**（仓库根，新增）— 包含每个 env var + 默认值 + 注释
   "required / optional / readonly"。生成命令也写在注释里（如
   `ENCRYPTION_KEY` / `AUTH_JWT_SECRET` 的 `openssl rand -hex 32`）。
2. **`infra/scripts/check-env.sh`**（新增）— 解析 `.env`，检查 required 变量
   存在 + 格式校验（hex 长度、URL scheme）；缺失列出 + 退出码非零；docker
   compose 文件用 `command:` prefix 调用它做 fail-fast。
3. **`infra/docker-compose.yml`** — 在 gateway / quant service 上加 `healthcheck`
   段，依赖改 `condition: service_healthy`（已部分有；补 gateway / quant）。
4. **`infra/docker-compose.prod.yml`**（新增 override）—
   - 不暴露 mongo / redis / timescale 端口到 host (`ports:` 删掉)。
   - gateway 后面塞一个 Caddy 容器作 reverse proxy + 自动 TLS。
   - `restart: always`。
   - env vars 改读 `secrets:` (docker swarm secrets) 或 env file 不带 password
     的 export。
5. **`infra/docker-compose.dev.yml`**（新增 override）— 暴露所有端口便于调试，
   `tty: true`，volume 挂载源代码（gateway 走 `air` reload，quant 走 `uv run
   --reload`）。
6. **`README.md`** rewrite — 加 "5 分钟启动" / "升级到 production" / "常见
   错误"。
7. **healthcheck endpoints 完善**：
   - gateway `/healthz` 现在只返 `{status: ok}`；扩展为 `{status, deps:
     {mongo: ok|err, redis: ok|err, timescale: ok|err, quant: ok|err}}`，
     供 `/settings/deployment` 直接消费。
   - quant FastAPI `/healthz` 现存；加 `/readyz`（Arq 队列连接 / Timescale
     可写）。
8. **k8s 文档** — `infra/k8s/README.md`（新增）描述 secrets 怎么改、namespace
   隔离、ingress TLS。kustomization 已检入；不动结构。

**dev / prod 区分**（compose 三档）

| 档 | compose 文件 | 端口暴露 | TLS | 用途 |
|---|---|---|---|---|
| dev    | `docker-compose.yml` (现存) | 全部 | 无 | local 开发 |
| dev+   | `docker-compose.yml` + `docker-compose.dev.yml` | 全部 + tty + hot reload | 无 | 写代码 |
| prod   | `docker-compose.yml` + `docker-compose.prod.yml` | 仅 80/443 | Caddy auto | 单机生产 |

**文档大纲** (`docs/deployment/` 三篇)
- `01-quickstart.md` — 单机 docker-compose 5 分钟启动。
- `02-production.md` — Caddy / TLS / backup / kill-switch 试运行步骤。
- `03-troubleshooting.md` — 常见错误（mongo 未启 / KEK 未配 / WS upgrade 403 origin mismatch 等）。

---

## 2. 不做什么 (YAGNI)

- **不做多租户 / SaaS**: 用户模型是单 owner + 邀请成员，**没有 organizations
  / workspaces / 跨租户隔离 / 计费 / 用量统计**。一台部署 = 一个团队。
- **不做 SSO / OAuth**: email + password 足够。Google / GitHub 登录是
  unnecessary scope，留作 future hook（auth middleware 接口已抽，加 provider
  容易）。
- **不做 MFA / TOTP**: 单 owner 默认信任 password；admin 想要可以走 reverse
  proxy 的 BasicAuth 二次锁。
- **不做 i18n full**: 内置 zh-CN + en 两份字符串表（已经全是中文，加 en 为
  defensive）；不引入 react-intl / formatJS。
- **不做主题编辑器**: 三档主题 (light/dark/system)；不暴露颜色 customization。
- **不做 AppStore / mobile native**: 响应式 web 就够；不打 React Native。
- **不上 Redux / RTK Query**: server components + 现有 fetch wrapper 够用；
  保留 `apiFetch` + SWR 局部缓存（如果出现）。
- **不做 audit log 搜索 / 全文索引**: `/admin/audit` 现有 actor / resourceType
  / since 三过滤足够；不上 Elastic / Loki。
- **不写新的回测策略类型**: 现有 `grid_dca` / `polymarket_event` 不动；
  本次重构纯前端 + auth + 配置 + 部署。
- **不替换 MongoDB / TimescaleDB**: 持久化层完全不动。
- **不切 KMS 真接入**: KEK provider stub 保持（env / aws-stub / gcp-stub）；
  本次 `/settings/deployment` 只显示当前 provider 名称，不做 cutover。
- **不重写 quant 量化层**: AI / Optuna / ingest pipeline 不动；只把 AI config
  的菜单更直观。

---

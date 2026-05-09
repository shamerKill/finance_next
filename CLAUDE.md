# CLAUDE.md

> 本文件供 Claude（及其它 AI 协作者）在本仓库工作时快速 onboarding。
> 项目为 monorepo，分 `client/`（Next.js 前端）与 `gateway/`（Go 后端）。
> Phase 0 已完成：原 NestJS `server/` 已删除，由 `gateway/` 承接 Option CRUD。

---

## 1. 项目概述

`finance_next` 是一个**加密货币 / 期权策略管理工具**的原型，帮助交易者维护
策略配置（杠杆、止盈止损、分批补仓比例、交易所 API 凭证），并通过自有后端
持久化到 MongoDB Atlas。当前仅完成了 `Option`（策略配置）资源的 CRUD 链路，
真正的订单执行、账户管理、自动化下单逻辑尚未实现。

## 2. 技术栈

**前端 `client/`**
- Next.js 16（App Router, Turbopack）· React 19 · TypeScript 5.6
- HeroUI 2.8（原 NextUI） · Tailwind CSS 4（CSS-first 配置）· Framer Motion 12
- ESLint 9（flat config，`eslint.config.mjs`）

**后端 `gateway/`**
- Go 1.23+ · Echo v4
- `go.mongodb.org/mongo-driver/v2`（MongoDB Atlas）
- `go-playground/validator/v10`（DTO 校验）
- `joho/godotenv`（本地 `.env` 加载）
- AES-256-GCM 凭证加密，与原 NestJS 实现字节级兼容（golden vector 测试在
  `gateway/internal/crypto/crypto_test.go`）

## 3. 目录结构

```
finance_next/
├── client/
│   ├── app/                          # Next App Router
│   │   ├── page.tsx                  # 首页（链接到 dashboard）
│   │   ├── layout.tsx                # 全局 NextUI Provider + 字体
│   │   ├── (dashboard)/              # 路由组：共享侧栏 layout
│   │   │   ├── layout.tsx
│   │   │   ├── accounts/page.tsx     # 账户列表
│   │   │   ├── accounts/new/page.tsx # 添加账户表单
│   │   │   ├── accounts/[id]/        # 账户详情 + 实时事件流
│   │   │   ├── api-list/             # 策略列表（async server component）
│   │   │   └── option/page.tsx       # 期权策略表单页
│   │   └── list/                     # 占位，功能未实现
│   ├── data/
│   │   ├── type.d.ts                 # TypeOption / TypeAccount 等共享类型
│   │   ├── api-client.ts             # REST fetch 封装（env 驱动 baseUrl）
│   │   └── ws-client.ts              # WebSocket 客户端 + useAccountStream hook
│   ├── next.config.mjs · tailwind.config.ts · tsconfig.json
└── gateway/
    ├── go.mod
    ├── .env.example                  # MONGODB_URI / ENCRYPTION_KEY / PORT
    ├── cmd/gateway/main.go           # bootstrap：Echo on :3001，graceful shutdown
    └── internal/
        ├── config/                   # 加载 env（含 godotenv 本地 .env）
        ├── crypto/                   # AES-256-GCM + 信封加密（golden vector 测试）
        ├── domain/                   # Option / Account / DTO 类型
        ├── exchange/                 # 抽象 ReadOnlyClient + binance/ adapter
        ├── ws/                       # 单进程 WS hub + Echo /ws handler
        ├── store/mongo/              # options 与 accounts 集合 CRUD
        └── http/
            ├── router.go             # Echo 路由 + middleware
            └── handlers/             # option.go + account.go
```

## 4. 常用命令

```bash
# 前端
cd client
yarn dev        # 开发
yarn build      # 构建
yarn start      # 生产启动
yarn lint

# 后端（Go gateway）
cd gateway
go run ./cmd/gateway        # 开发（读取 gateway/.env 或仓库根 .env）
go build ./cmd/gateway      # 编译
go test ./...               # 单测（含 crypto golden vector）
go vet ./...                # 静态检查
```

## 5. 数据模型与 API

**端口与前缀**
- 后端监听 `:3001`（`gateway/cmd/gateway/main.go`，`PORT` env 可覆盖）
- 全局前缀 `api`（`gateway/internal/http/router.go`）
- 资源前缀 `v1`（同上）
- 前端 baseUrl：`process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api'`
  （`client/data/api-client.ts`）

**Option 资源**（`gateway/internal/http/handlers/option.go`）
| 方法     | 路径                  | 说明                                |
| ------ | ------------------- | --------------------------------- |
| GET    | `/api/v1/option`    | 列表                                |
| GET    | `/api/v1/option/:id`| 详情                                |
| POST   | `/api/v1/option`    | 创建，返回 `{ message, value: { name } }` |
| PUT    | `/api/v1/option/:id`| 更新                                |
| DELETE | `/api/v1/option/:id`| 删除                                |

**Account 资源**（`gateway/internal/http/handlers/account.go`，phase 1）
| 方法     | 路径                                  | 说明                                                |
| ------ | ----------------------------------- | ------------------------------------------------- |
| GET    | `/api/v1/accounts`                  | 当前 user 列表（phase 7 前 userId="default"）            |
| POST   | `/api/v1/accounts`                  | 创建：探权限 → 拒 `canWithdraw` → 信封加密入库                  |
| GET    | `/api/v1/accounts/:id`              | 详情（不含密文）                                          |
| DELETE | `/api/v1/accounts/:id`              | 删除                                                |
| GET    | `/api/v1/accounts/:id/balances`     | 调 Binance 实时余额                                    |
| GET    | `/api/v1/accounts/:id/positions`    | 调 Binance USDM `/fapi/v2/positionRisk`            |
| GET    | `/ws`                               | 浏览器 WS：`subscribe`/`unsubscribe`/`ping`，扇出 Binance user-data |

**Option 字段**（以 `CreateOptionDto` 为准，`client/data/type.d.ts` 与之对应）
- `name`（3-8 字符，唯一）
- `positionLevel`（杠杆，1-125）
- `openPositionStopTime`（开仓未成交停止时间，分钟）
- `execSymbol`（交易对，如 `BTCUSDT`）
- `orderGroupMargin`（订单组保证金）
- `stopProfitRate` / `stopLossRate`（止盈/止损比例）
- `profitRateAfterAtAddPosition`（补仓后止盈降低比例）
- `createCostOrderInProfit`（止盈后是否创建保本单）
- `createPositions: [{ marginRate, lossAddRate }]`（分批开仓/补仓配置）
- `userEmail` / `userApiKey` / `userSecretKey`（交易所凭证）

DTO 校验由 `go-playground/validator/v10` 在 handler 内执行（POST/PUT 请求）。

## 6. 前端数据访问

`client/data/api-client.ts` 是唯一的 fetch 封装；baseUrl 走
`NEXT_PUBLIC_API_URL` 环境变量，缺省 `http://localhost:3001/api`。POST 已显式
设置 `Content-Type: application/json`。`api-list` 页面是 async server
component，直接在服务端调用 `getOptions()`。`option/page.tsx` 仅有表单 UI，
尚未接 POST 提交。

## 7. 安全与配置

- **环境变量**（`gateway/.env`，参考 `gateway/.env.example`）：
  - `MONGODB_URI` — 完整 Mongo 连接串（含库名）
  - `ENCRYPTION_KEY` — 32 字节十六进制（64 字符）。生成：
    `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  - `PORT` — HTTP 监听端口（默认 3001）
- **凭证加密**：`gateway/internal/crypto/crypto.go` 提供 AES-256-GCM 封装；
  `option` handler 在 create / update 时透明加密 `userApiKey` 与
  `userSecretKey`，密文格式 `base64(iv).base64(tag).base64(ciphertext)`，
  与原 NestJS 实现 byte-equal（见 `crypto_test.go` golden vector）。
- **接口防泄露**：`domain.Option` 上 `userApiKey` / `userSecretKey` 用
  `json:"-"` 标签剥除，且 `option_repo.go` 的解码路径会忽略 `__v`，
  GET 接口永不返回密钥（即便已加密）。

## 8. 注意事项 / 已知问题

- **`client/app/list/`** 为占位目录。
- **`option/page.tsx`** 表单尚未接通 POST 提交。
- **集成测试**：仓库目前缺少端到端 e2e（Phase 0 仅单测覆盖 crypto byte
  兼容性）；建议 Phase 1 起补 supertest-style 黑盒测试。

## 9. 当前进度 / TODO

- [x] Option CRUD（Controller / Service / DTO 校验）
- [x] 前端期权配置表单 UI
- [x] 前端策略列表 server component
- [x] 补全 `option.entity.ts` Schema（含 `createPositions` 子文档）
- [x] 凭证加密 + 环境变量化连接串
- [x] **Phase 0**：迁移到 Go gateway（Echo + mongo-driver v2）；
      crypto byte-compat golden vector；删除 `server/`；
      `client/data/api-client.ts` 替代 mock 假切换
- [x] **Phase 1**：Binance 只读账户视图
      - `accounts` 集合 + 信封加密（per-account DEK + master KEK）
      - `gateway/internal/exchange/binance/` 只读 adapter（spot account / 余额 / USDM positionRisk）
      - 创建账户时 `ProbePermissions` 探权限，`canWithdraw=true` 直接 4xx 拒绝
      - `gateway/internal/ws/` 单进程 hub + `/ws` Echo 端点（phase 7 多副本时再分布式化）
      - `client/app/(dashboard)/accounts/` 列表/创建/详情；`ws-client.ts` 指数退避重连
- [ ] 期权配置表单接通 POST 提交
- [ ] `client/app/list/` 实现
- [ ] **Phase 2+**：Python quant worker / 行情入库 / 回测 / 实盘 / AI 优化（详见
      `/root/.claude/plans/vectorized-waddling-hoare.md`）

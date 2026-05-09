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
│   │   │   ├── markets/              # OHLCV chart (lightweight-charts)
│   │   │   ├── backtests/            # Phase 3：列表/新建/详情（含 equity 图 + 实时进度 WS）
│   │   │   ├── portfolio/            # Phase 5：跨交易所余额 / 资产汇总（server component）
│   │   │   └── option/page.tsx       # 期权策略表单页
│   │   └── list/                     # 占位，功能未实现
│   ├── data/
│   │   ├── type.d.ts                 # TypeOption / TypeAccount 等共享类型
│   │   ├── api-client.ts             # REST fetch 封装（env 驱动 baseUrl）
│   │   └── ws-client.ts              # WebSocket 客户端 + useAccountStream hook
│   ├── next.config.mjs · tailwind.config.ts · tsconfig.json
├── gateway/
│   ├── go.mod                        # `replace` 拉取 ../shared-proto 为本地模块
│   ├── Dockerfile                    # 多阶段静态构建（golang:1.25-alpine → alpine）
│   ├── .env.example                  # MONGODB_URI / ENCRYPTION_KEY / PORT / TIMESCALE_DSN / QUANT_GRPC_ADDR / ADMIN_KEY / REDIS_URL
│   ├── cmd/gateway/main.go           # bootstrap：Echo on :3001，graceful shutdown，启动 orderengine
│   └── internal/
│       ├── config/                   # 加载 env（含 godotenv 本地 .env）
│       ├── crypto/                   # AES-256-GCM + 信封加密（golden vector 测试）
│       ├── domain/                   # Option / Account / Order / DTO 类型
│       ├── exchange/                 # 抽象 ReadOnlyClient/OrderClient/Adapter
│       │   ├── exchange.go           # 共享类型 (OrderRequest/Result/OpenOrder) + Adapter 接口
│       │   ├── binance/              # Binance 只读 + USDM 下单（testnet 默认）
│       │   ├── okx/                  # OKX v5 REST 适配器（demo header / mainnet gate 共享）
│       │   ├── bybit/                # Bybit unified-trading v5 适配器
│       │   ├── symbol/               # canonical "BTC/USDT:USDT" 归一化（idempotent property tests）
│       │   └── meta/                 # 启动时 exchange_meta 刷新 job（>24h staleness）
│       ├── ws/                       # 单进程 WS hub（topic 模型：account / backtest / strategy）+ Redis Streams 消费
│       ├── orderengine/              # Phase 4：Redis stream 消费 + 风控闸 + 30s reconcile loop + mainnet token gate（venue-aware factory）
│       ├── store/{mongo,timescale}/  # mongo (options/accounts/backtest_results/order_log/exchange_meta) + timescale (ohlcv 读 + equity_curve 读)
│       ├── quantclient/              # gRPC client → Python quant worker
│       └── http/
│           ├── router.go             # Echo 路由 + middleware
│           └── handlers/             # option.go + account.go + market.go + backtest.go + strategy.go + exchange_meta.go + portfolio.go
├── quant/                            # Phase 2 Python 量化 worker（uv 管理）
│   ├── pyproject.toml                # uv-managed deps (fastapi/grpcio/ccxt/akshare/asyncpg/arq)
│   ├── Dockerfile                    # uv:python3.12-bookworm-slim
│   ├── src/quant/
│   │   ├── main.py                   # FastAPI healthz + grpc.aio bootstrap
│   │   ├── grpc_server.py            # QuantServicer (impls quant.v1.Quant)
│   │   ├── ratelimit.py              # async TokenBucket + 每交易所 registry
│   │   ├── data/{ccxt_source,akshare_source,timescale,symbols,mongo}.py
│   │   ├── strategies/{base,grid_dca}.py  # Phase 3：抽象策略 + 信号→portfolio 模拟器（带 shift(1) 防 look-ahead）
│   │   ├── runtime/runtime.py        # Phase 4：长生命周期 asyncio 任务，每分钟扫 live=true 策略并发 command.order.submit
│   │   ├── workers/{ingest,backtest,settings}.py  # Arq 任务 + WorkerSettings
│   │   └── events/redis_stream.py    # OhlcvIngested + BacktestProgress/Completed 发布
│   └── tests/                        # 离线运行：respx + fakeredis + 模块替换
├── shared-proto/                     # protobuf 单一来源（Go + Python 生成代码已检入）
│   ├── quantpb/v1/quant.proto        # gRPC 服务（IngestNow Phase 2 落地）
│   ├── eventspb/v1/events.proto      # Redis Stream payload schema
│   ├── buf.yaml + buf.gen.yaml + gen-python.sh  # Go 用 buf；Python 用 grpc_tools.protoc
│   └── gen/{go,python}/              # 检入的生成代码
├── infra/
│   ├── docker-compose.yml            # mongo / redis / timescale / gateway / quant
│   └── timescale/{001_init,002_hypertables}.sql  # 扩展 + 表 + 连续聚合
└── go.work                           # 仓库根 Go workspace（gateway + shared-proto）
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

# Python quant worker（Phase 2）
cd quant
uv sync --extra dev                                  # 安装依赖
uv run python -m quant.main                          # 启 FastAPI :8000 + gRPC :50051
uv run arq quant.workers.settings.WorkerSettings     # Arq 后台任务（独立进程）
uv run pytest -q                                     # 单测（离线 mock）
uv run ruff check .                                  # lint

# protobuf 代码生成（修改 shared-proto/*.proto 后跑）
cd shared-proto
buf generate                                         # Go 输出到 gen/go/
./gen-python.sh                                      # Python 输出到 gen/python/

# 整套 docker 栈
docker compose -f infra/docker-compose.yml up --build
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

**Market 资源**（`gateway/internal/http/handlers/market.go`，phase 2）
| 方法     | 路径                       | 说明                                                       |
| ------ | ------------------------ | -------------------------------------------------------- |
| GET    | `/api/v1/market/ohlcv`   | 直读 Timescale；query：exchange/symbol/timeframe/start/end；上限 100k 根 |
| POST   | `/api/v1/market/ingest`  | 调 Quant gRPC 触发 OHLCV 回填；header `X-Admin-Key` 鉴权；`ADMIN_KEY` 未配置时 404 |

**Backtest 资源**（`gateway/internal/http/handlers/backtest.go`，phase 3）
| 方法     | 路径                                | 说明                                                                         |
| ------ | --------------------------------- | -------------------------------------------------------------------------- |
| POST   | `/api/v1/backtests`               | 调 Quant.RunBacktest gRPC，202 Accepted 返回 `{runId, enqueuedAt}`             |
| GET    | `/api/v1/backtests`               | 列表（最新优先）；可选 `?strategyId=`/`?limit=`                                       |
| GET    | `/api/v1/backtests/:id`           | 头 doc（含 metrics + trades + 状态 1=PENDING/2=RUNNING/3=COMPLETED/4=FAILED）   |
| GET    | `/api/v1/backtests/:id/equity`    | 直读 Timescale `equity_curve`，上限 50k 点                                       |
| GET    | `/api/v1/backtests/:id/trades`    | 直返 head doc 中的 trades 数组                                                   |

**Strategy 资源**（`gateway/internal/http/handlers/strategy.go`，phase 4）
| 方法     | 路径                                              | 说明                                                                           |
| ------ | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| GET    | `/api/v1/strategies/:id/orders`                 | `order_log` 列表（按 strategyId）；`?limit=&before=` 分页                              |
| POST   | `/api/v1/strategies/:id/live`                   | toggle live；`{enabled, accountId?, mode?}`；切 mainnet 需 gate 已开启                |
| POST   | `/api/v1/strategies/:id/live/submit-order`      | admin 手动下单（`X-Admin-Key`），写 Redis Stream `command.order.submit`               |
| POST   | `/api/v1/admin/mainnet/request-token`           | admin token 申请；返回前缀 hint，**完整 token 仅打印到 stderr**（"EMAIL CONFIRMATION REQUIRED"）|
| POST   | `/api/v1/admin/mainnet/confirm`                 | admin token 确认；body `{token}`；成功后开启 1 小时 mainnet 窗口                            |
| GET    | `/api/v1/admin/mainnet/status`                  | admin gate 状态查询（envEnabled / mainnetAllowed / pendingTokenCount）                |

**Exchange Meta + Portfolio**（`gateway/internal/http/handlers/exchange_meta.go` + `portfolio.go`，phase 5）
| 方法     | 路径                              | 说明                                                                                 |
| ------ | ------------------------------- | ---------------------------------------------------------------------------------- |
| GET    | `/api/v1/exchange/meta`         | `exchange_meta` 列表；`?exchange=&symbol=` 过滤；symbol 为空时返回该 exchange 全部              |
| GET    | `/api/v1/portfolio/summary`     | 跨账户余额汇总：`{totalUsd, perExchange[], perAsset (top 10)[], notes[]}`，USD 估值走 Timescale 最近 close（`<asset>USDT`）|

WS（phase 3 扩展 topic 模型 + phase 4 增加 strategy）：
- 现有 `{type:"subscribe", accountId:"..."}` 仍兼容（默认 topic=`account`）。
- `{type:"subscribe", topic:"backtest", id:"<runId>"}` — gateway 订阅 Redis Streams `event.backtest.progress` / `event.backtest.completed`，按 runId 过滤后扇出。
- `{type:"subscribe", topic:"strategy", id:"<strategyId>"}` — gateway 订阅 Redis Stream `events`（订单事件），按 strategyId 过滤推 `event.order.{filled|rejected|canceled|updated}`。

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

**多交易所账户（Phase 5）**：`POST /api/v1/accounts` 现在接受 `exchange ∈
{binance, okx, bybit}`。**OKX 账户的 `passphrase` 字段为必填**（OKX
API key 创建时设的 passphrase；信封加密保存）；Bybit/Binance 不需要。
权限探测按 venue 走对应路径（binance: `/api/v3/account.canWithdraw`；
okx: `/api/v5/account/config`，无 level 视为 fail-closed；bybit:
`/v5/user/query-api`，`permissions.Wallet` 含 `Withdraw…` 视为
canWithdraw=true，解析失败 fail-closed）。

**符号归一化**：`gateway/internal/exchange/symbol` 提供
`CanonicalSymbol "BTC/USDT:USDT"` 与 `ToBinance/ToOKX/ToBybit` +
`FromX` 反向映射；ccxt 风格的 unified market id。Quant worker 的
`quant/data/symbols.py` 与之 lock-step（`to_native()`）。

## 7. 安全与配置

- **环境变量**（`gateway/.env`，参考 `gateway/.env.example`）：
  - `MONGODB_URI` — 完整 Mongo 连接串（含库名）
  - `ENCRYPTION_KEY` — 32 字节十六进制（64 字符）。生成：
    `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  - `PORT` — HTTP 监听端口（默认 3001）
  - `TIMESCALE_DSN` — `postgres://app:app@host:5432/finance`；为空时
    `/api/v1/market/ohlcv` 返回 503
  - `QUANT_GRPC_ADDR` — Python quant worker 的 gRPC 地址（如
    `quant:50051`）；为空时 `/api/v1/market/ingest` 返回 503
  - `ADMIN_KEY` — `/api/v1/market/ingest` 的静态鉴权 key；**为空时整个端点返回
    404**（藏起来）；非空时调用方需带 `X-Admin-Key` header
  - `REDIS_URL` — `redis://[:pwd@]host:port[/db]`；Phase 3 起 gateway 用其消费
    `event.backtest.progress` / `event.backtest.completed` 流转给 WS hub；
    Phase 4 订单引擎、Phase 6 事件流继续用同一 Redis 实例
  - `MONGODB_URI`（quant 端 Phase 3 新增）— Python worker 写 `backtest_results`
    head 文档；为空时 `Quant.RunBacktest` 返回 `FAILED_PRECONDITION`
  - `ARQ_REDIS_URL`（quant 端 Phase 3 新增，可选）— 配置后 gRPC `RunBacktest`
    走 Arq 后台队列；未配置则在 grpc.aio 同进程内 `asyncio.ensure_future` 跑回测
    （单机 dev 友好，生产应启 `arq quant.workers.settings.WorkerSettings`）
  - `MAINNET_TRADING_ENABLED`（gateway，Phase 4 新增）— 必须为字面量 `true`
    才允许尝试 Binance mainnet 下单。**默认未设 = 永远只走 testnet**。即使
    设为 true，仍需 admin 走完 token request → confirm 流程（见 §8 安全说明）。
  - `QUANT_RUNTIME_DISABLED`（quant 端，Phase 4 新增，可选）— `true` 时
    `quant.runtime` 长生命周期任务不启动；测试和冷启动时使用。
  - **测试网默认**：gateway 的 Binance 订单适配器 (`exchange/binance/orders.go`)
    构造时根据 `Live.Mode` 把 `futures.BaseURL` pin 到
    `https://testnet.binancefuture.com`（mainnet 需要 env+token gate 同时开
    启才会 pin 到 `https://fapi.binance.com`）。
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
- **Mainnet 安全契约**（Phase 4，硬要求）：Binance 真实账户下单需要 **三**
  道开关全部打开 — (1) 策略 `live.mode == "mainnet"`、(2) env
  `MAINNET_TRADING_ENABLED=true`、(3) admin 通过 `/admin/mainnet/request-token`
  → `/admin/mainnet/confirm` 走完 token 流程并在 1 小时窗口内。任何一项缺失，
  `gateway/internal/exchange/binance/orders.go` 的 `OrderClient.guard()` 直接
  返回 `ErrMainnetGateDenied`，不会触达交易所。**默认 testnet-only**；测试网
  端点写死在 `TestnetFuturesREST = https://testnet.binancefuture.com`。
- **风控闸**（Phase 4，硬要求）：策略 `risk` 三项（`maxPositionUsd` /
  `maxLeverage` / `dailyLossCapUsd`）任一缺失或 ≤0，`orderengine.processCommand`
  直接以 `ErrRiskMissing` 拒绝并发 `event.order.rejected`，不会回退到默认值。
- **token 生成行为**：`/admin/mainnet/request-token` 不在 HTTP 响应中返回
  完整 token，只返回 8 字符前缀 hint。完整 token 通过日志 stderr 打印（关键字
  `EMAIL CONFIRMATION REQUIRED`），运维需从日志拷贝后调 `/confirm`。Phase 7
  会替换为真实邮件发信。

## 9. 当前进度 / TODO

- [x] Option CRUD（Controller / Service / DTO 校验）
- [x] 前端期权配置表单 UI
- [x] 前端策略列表 server component
- [x] 补全 `option.entity.ts` Schema（含 `createPositions` 子文档）
- [x] 凭证加密 + 环境变量化连接串
- [x] **Phase 0**：迁移到 Go gateway（Echo + mongo-driver v2）；
      crypto byte-compat golden vector；删除 `server/`；
      `client/data/api-client.ts` 替代 mock 假切换
- [x] **Phase 2**：Python quant worker + 行情入库
      - `shared-proto/` + buf 代码生成（Go + Python 检入 `gen/`）
      - `infra/docker-compose.yml` + TimescaleDB init SQL（hypertables + 5m/1h 连续聚合）
      - `quant/` Python 服务（FastAPI + grpc.aio + Arq + asyncpg）
      - ccxt + AKShare 入库 + 每交易所 token-bucket 速率控制
      - gateway `/api/v1/market/ohlcv` 直读 Timescale；admin `/market/ingest` 调 Quant.IngestNow
      - UI `(dashboard)/markets` + lightweight-charts
- [x] **Phase 1**：Binance 只读账户视图
      - `accounts` 集合 + 信封加密（per-account DEK + master KEK）
      - `gateway/internal/exchange/binance/` 只读 adapter（spot account / 余额 / USDM positionRisk）
      - 创建账户时 `ProbePermissions` 探权限，`canWithdraw=true` 直接 4xx 拒绝
      - `gateway/internal/ws/` 单进程 hub + `/ws` Echo 端点（phase 7 多副本时再分布式化）
      - `client/app/(dashboard)/accounts/` 列表/创建/详情；`ws-client.ts` 指数退避重连
- [x] **Phase 3**：回测引擎 + UI
      - `quantpb/v1` 落地 `RunBacktest` / `GetBacktestStatus` / `StreamBacktestProgress`（参数走
        `google.protobuf.Struct`）；`eventspb/v1` 加 `BacktestProgress` / `BacktestCompleted`
      - `quant/strategies/{base,grid_dca}.py`：抽象策略 + 信号→portfolio 模拟器；
        **shift(1) 防 look-ahead 写死并 assert**（详见 `base.py:run_backtest` 注释）
      - `quant/workers/backtest.py`：Arq task；写 Mongo `backtest_results` head + Timescale
        `equity_curve`；按 10% 节流发 `event.backtest.progress`，结束发 `event.backtest.completed`
      - gateway `internal/store/mongo/backtest_repo.go` + `internal/store/timescale/equity.go` +
        `internal/http/handlers/backtest.go`；WS hub 扩展为 (topic, id) 模型，新增
        `internal/ws/redis_backtest.go` 消费 Redis Streams 扇出
      - `client/app/(dashboard)/backtests/{page,new,[id]}.tsx`：列表 + 表单 + 详情（lightweight-charts
        equity 曲线 + trade 表 + `useBacktestStream` 实时进度）
- [x] **Phase 4**：Binance testnet 实盘执行
      - `gateway/internal/exchange/binance/orders.go`：USDM 下单 / 取消 / `GetOpenOrders` / `GetOrder`；
        构造时按 `LiveMode` pin BaseURL，**默认 testnet**；mainnet path 受 `MainnetGate.Allowed()` 守门
      - `gateway/internal/store/mongo/order_repo.go`：`order_log` 集合 + 三索引（unique
        clientOrderId / strategy_submittedAt / account_status）+ 幂等 Insert
      - `gateway/internal/orderengine/`：4-worker 池消费 Redis Stream `command.order.submit`；
        风控闸（`maxPositionUsd` / `maxLeverage` / `dailyLossCapUsd` 都强制必填）；
        sha256-32hex `clientOrderId`；30 秒 reconcile loop（`ListOpenForAccount` × 交易所 diff，
        local-but-not-remote → mark unknown → `GetOrder` 终态）；mainnet `TokenStore`
        （request 10min TTL → confirm 1h 窗口）
      - WS `redis_strategy.go` + `(kind=strategy, id=strategyId)` topic；订单事件经 Redis
        Stream `events` → 浏览器
      - `quant/runtime/runtime.py`：长生命周期 asyncio 任务，每分钟扫 `live.enabled=true` 策略，
        对最新 OHLCV 跑 `grid_dca.signals()`，新 bar 出 entry/exit 时发 `command.order.submit`，
        `idempotencyKey="<strat>:<kind>:<symbol>:<bar_ts>"`；`QUANT_RUNTIME_DISABLED=true` 关闭
      - UI `client/app/(dashboard)/strategies/{page,[id]/page}.tsx`：列表（含 Live 徽章）+ 详情
        （Live toggle / 风控编辑 / WS 实时订单流 / mainnet 警告条）；`ws-client.ts` 加
        `useStrategyStream` hook
      - admin endpoints `/admin/mainnet/{request-token,confirm,status}`（参考 §5、§8）
- [x] **Phase 5**：OKX + Bybit 适配器 + 跨交易所基础设施
      - `gateway/internal/exchange/exchange.go` 提升 `OrderClient` / `Adapter` 接口
        + 共享 `OrderRequest/OrderResult/OpenOrder` 类型；`ErrMainnetGateDenied` sentinel
      - `gateway/internal/exchange/okx/`：v5 REST 适配器（client+sign+demo header /
        readonly probe-config / orders 受同一 mainnet gate；passphrase 必填）
      - `gateway/internal/exchange/bybit/`：unified-trading v5 适配器
        （HMAC-SHA256 sign / wallet-balance / position/list / query-api 的
        `permissions.Wallet` 检测）
      - `gateway/internal/exchange/symbol/`：canonical `BTC/USDT:USDT` 形态 +
        `ToBinance/ToOKX/ToBybit/FromX`；idempotent property tests
      - `gateway/internal/store/mongo/exchange_meta_repo.go` + `internal/exchange/meta/refresh.go`：
        启动时刷 binance/okx/bybit `exchangeInfo` / `instruments` / `instruments-info`，
        24h staleness gate；`GET /api/v1/exchange/meta` 直读
      - 订单引擎 `OrderClientFactory(venue, mode, key, secret, passphrase)`：按 `domain.Exchange`
        分发到三个适配器，**共用同一个 `TokenStore`**（mainnet 开关三方共享）
      - 账户创建按 venue 分别探权限；OKX 强制 passphrase；前端 `accounts/new`
        条件展示 passphrase 字段
      - `GET /api/v1/portfolio/summary`：跨账户 USD 汇总（best-effort 走 Timescale
        最近 close）；UI `(dashboard)/portfolio`
      - `quant/data/symbols.py` 同步加 canonical 形态 + `to_native()`
- [ ] 期权配置表单接通 POST 提交
- [ ] `client/app/list/` 实现
- [ ] **Phase 6+**：AI 优化循环 / 加固（详见
      `/root/.claude/plans/vectorized-waddling-hoare.md`）

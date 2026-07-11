# AGENTS.md

> 本文件供 Codex（及其它 AI 协作者）在本仓库工作时快速 onboarding。
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
│   │   │   ├── data-explorer/        # Phase 8：equities / futures / macro / onchain / news 浏览页
│   │   │   ├── wallets/              # Phase 9：Polygon 钱包 CRUD + 强警告表单 + bounded approve
│   │   │   ├── prediction/markets/   # Phase 9：Polymarket 列表 + 详情（orderbook + 最近 trades）
│   │   │   ├── prediction/strategies/ # Phase 9：预测策略 CRUD + live toggle + 订单流
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
│       ├── orderengine/              # Phase 4：Redis stream 消费 + 风控闸 + 30s reconcile loop + mainnet token gate（venue-aware factory）；Phase 7 在风控闸前加 portfolio kill switch + 跨策略 cap
│       ├── observability/            # Phase 7：进程内 Prometheus 计数器/直方图 + tracer 接口（默认 stdout/noop）
│       ├── store/{mongo,timescale}/  # mongo (options/accounts/backtest_results/order_log/exchange_meta/system_state/portfolio_limits/audit + Phase 9: polygon_wallets/prediction_strategies/prediction_orders) + timescale (ohlcv/equity_curve 读 + Phase 8: macro/onchain/news 读 + Phase 9: prediction_markets/quotes/trades 读)
│       ├── quantclient/              # gRPC client → Python quant worker
│       ├── wallet/polygon/           # Phase 9：Polygon wallet 包（私钥 envelope 加密 + USDC bounded approve + RPC 接口；NoopRPC 默认，POLYGON_RPC_URL 设置时 EthClientRPC 通过 ethclient/abi 调用 USDC.balanceOf/allowance/approve + 60s receipt poll）
│       ├── prediction/polymarket/    # Phase 9：CLOB REST 客户端 + EIP-712 typed-data signer（golden vector 测试）+ 3-gate（共享 Phase 4 TokenStore）
│       ├── prediction/engine/        # Phase 9：独立 worker pool 消费 Redis Stream `command.prediction.submit`；kill switch + maxNotionalUsd / maxOpenMarkets / maxSlippageBps + portfolio cap + mainnet 3-gate；30s reconcile
│       └── http/
│           ├── router.go             # Echo 路由 + middleware（Phase 7：HTTP 直方图 + audit 中间件 + /metrics endpoint）
│           ├── middleware/audit.go   # Phase 7 异步 audit middleware（缓冲通道 + 敏感字段脱敏 + 溢出计数；Phase 9：scrub list 加 privateKey/mnemonic/seed）
│           └── handlers/             # option.go + account.go + market.go + backtest.go + strategy.go + exchange_meta.go + portfolio.go + recommendation.go + optimization.go + admin.go (Phase 7：halt/resume/system-state/portfolio-limits/audit) + data_explorer.go (Phase 8：equities/futures/macro/onchain/news + admin/ingest/*) + wallet.go + prediction.go + prediction_strategy.go (Phase 9)
├── quant/                            # Phase 2 Python 量化 worker（uv 管理）
│   ├── pyproject.toml                # uv-managed deps (fastapi/grpcio/ccxt/akshare/asyncpg/arq)
│   ├── Dockerfile                    # uv:python3.12-bookworm-slim
│   ├── src/quant/
│   │   ├── main.py                   # FastAPI healthz + grpc.aio bootstrap
│   │   ├── grpc_server.py            # QuantServicer (impls quant.v1.Quant)
│   │   ├── ratelimit.py              # async TokenBucket + 每交易所 registry
│   │   ├── data/{ccxt_source,akshare_source,timescale,symbols,mongo,recommendations,extended_repo,errors}.py
│   │   ├── data/equities/{akshare_cn,yfinance_intl,polygon_stub}.py  # Phase 8：A 股 + intl + paid stub
│   │   ├── data/futures/akshare_cn.py                                # Phase 8：CN commodity / index futures
│   │   ├── data/macro/{fred,akshare_cn}.py                           # Phase 8：FRED + CN 宏观
│   │   ├── data/onchain/{defillama,etherscan,blockchain_info,glassnode_stub,nansen_stub}.py  # Phase 8
│   │   ├── data/news/{cryptopanic,akshare_cn,rss_aggregator,sentiment}.py  # Phase 8
│   │   ├── data/prediction/{polymarket_gamma,polymarket_clob,polymarket_ws,types}.py  # Phase 9：Gamma 元数据 + CLOB REST + WS
│   │   ├── strategies/{base,grid_dca,polymarket_event}.py  # Phase 3：抽象策略 + 信号→portfolio 模拟器（带 shift(1) 防 look-ahead）+ Phase 9 Polymarket 示例
│   │   ├── runtime/{runtime,extended_consumer}.py  # Phase 4 long-lived runtime + Phase 8 admin-ingest stream consumer
│   │   ├── ai/{claude_client,cost_ledger,optimizer,prompts,extended_context}.py  # Phase 6 + Phase 8 extended context
│   │   ├── workers/{ingest,backtest,optimize,settings,extended_ingest}.py  # Arq 任务 + WorkerSettings + daily/hourly cron
│   │   └── events/redis_stream.py    # OhlcvIngested + BacktestProgress/Completed + OptimizationProgress/Suggested 发布
│   └── tests/                        # 离线运行：respx + fakeredis + 模块替换
├── shared-proto/                     # protobuf 单一来源（Go + Python 生成代码已检入）
│   ├── quantpb/v1/quant.proto        # gRPC 服务（IngestNow Phase 2 落地）
│   ├── eventspb/v1/events.proto      # Redis Stream payload schema
│   ├── buf.yaml + buf.gen.yaml + gen-python.sh  # Go 用 buf；Python 用 grpc_tools.protoc
│   └── gen/{go,python}/              # 检入的生成代码
├── infra/
│   ├── docker-compose.yml            # mongo / redis / timescale / gateway / quant
│   ├── timescale/{001_init,002_hypertables,003_extended_data,004_prediction}.sql  # 扩展 + 表 + 连续聚合 + Phase 8 macro/onchain/news 表 + Phase 9 prediction_markets/quotes/trades
│   ├── grafana/dashboards/{gateway,quant}.json    # Phase 7：committed Grafana JSON exports
│   ├── k8s/                          # Phase 7：Deployments / StatefulSets / Ingress / HPA / kustomization.yaml（finance-next-secrets 仅占位 example）
│   └── scripts/                      # Phase 7：backup-{mongo,timescale}.sh + restore-* + README（commit-only，**不会自动跑**）
├── .github/workflows/ci.yml          # Phase 7：Go vet/test/build + ruff + pytest + yarn lint/build
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
| POST   | `/api/v1/option`    | 创建，返回 `{ message, value: { id, name } }` |
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

**Admin (Phase 7)** — 全部需 `X-Admin-Key`；`ADMIN_KEY` 未配置时整组返回 404
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/v1/admin/halt`             | `{reason}`；写 `system_state.tradingHalted=true`，**order engine 在风控闸之前先读这个标志**，halted 时所有 submit 都拒绝 `ErrTradingHalted` |
| POST | `/api/v1/admin/resume`           | 清空 halt 状态 |
| GET  | `/api/v1/admin/system-state`     | 当前 halt + reason；UI dashboard layout 红条 banner 轮询此接口 |
| PUT  | `/api/v1/admin/portfolio-limits` | `{maxOpenNotionalUsd, maxOpenPositionsCount, maxDailyLossUsd}`；0 = no cap；engine 在 per-strategy gate 之后再做跨策略检查 |
| GET  | `/api/v1/admin/portfolio-limits` | 读当前 limits |
| GET  | `/api/v1/admin/audit`            | `audit` 列表；可选 `?actor=&resourceType=&since=&limit=`；分页上限 1000 |

**AI Recommendations + Optimization**（`gateway/internal/http/handlers/recommendation.go` + `optimization.go`，phase 6）
| 方法     | 路径                                                | 说明                                                                                          |
| ------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/recommendations`                         | 推荐列表；`?status=` (默认 `pending_review`) / `?strategyId=`                                       |
| GET    | `/api/v1/recommendations/:id`                     | 单条推荐详情（含 proposed params + rationale + expectedDelta）                                       |
| POST   | `/api/v1/recommendations/:id/approve`             | **原子事务**：写 strategy + 自增 `currentVersion` + supersede 同 strategy 其它 pending + emit `event.strategy.upserted` |
| POST   | `/api/v1/recommendations/:id/reject`              | `status=rejected`                                                                            |
| POST   | `/api/v1/strategies/:id/optimize`                 | 调 Quant.StartOptimization gRPC，202 返回 `{studyId, enqueuedAt}`                              |
| GET    | `/api/v1/optimizations`                           | study 列表（含 cost ledger snapshot）；`?strategyId=` 过滤                                          |
| GET    | `/api/v1/optimizations/:id`                       | study 头 doc                                                                                  |

**Data Explorer (Phase 8)**（`gateway/internal/http/handlers/data_explorer.go`）— Timescale 直读；admin ingest 经 `command.ingest.<kind>` Redis Stream 投到 quant worker 的消费 loop。`ADMIN_KEY` 未配置时所有 `/admin/ingest/*` 端点 404。
| 方法     | 路径                                          | 说明                                                                                                |
| ------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/equities/ohlcv`                    | 等价 `/market/ohlcv`，但允许 `exchange ∈ {sse,szse,nyse,nasdaq,hkex,...}`；symbol 用 `<code>.<exchange>` 形式 |
| GET    | `/api/v1/futures/ohlcv`                     | CN 商品/股指期货；`?exchange=&contract=&timeframe=&start=&end=`                                          |
| GET    | `/api/v1/macro/indicators`                  | `?source=&code=&start=&end=`；source ∈ {fred, cn_macro}；上限 50k 点                                    |
| GET    | `/api/v1/onchain/metrics`                   | `?chain=&metric=&start=&end=`；chain ∈ {btc, eth, multi}                                           |
| GET    | `/api/v1/news`                              | `?symbols=BTC,ETH&since=&limit=`；GIN array overlap 过滤；上限 1000                                     |
| POST   | `/api/v1/admin/ingest/{equities,futures,macro,onchain,news}` | XADD 到 `command.ingest.<kind>`；body 为 kwargs 透传；返回 `{stream, messageId}` 202 |

WS（phase 3 扩展 topic 模型 + phase 4 增加 strategy + phase 6 增加 optimization）：
- 现有 `{type:"subscribe", accountId:"..."}` 仍兼容（默认 topic=`account`）。
- `{type:"subscribe", topic:"backtest", id:"<runId>"}` — gateway 订阅 Redis Streams `event.backtest.progress` / `event.backtest.completed`，按 runId 过滤后扇出。
- `{type:"subscribe", topic:"strategy", id:"<strategyId>"}` — gateway 订阅 Redis Stream `events`（订单事件），按 strategyId 过滤推 `event.order.{filled|rejected|canceled|updated}`。
- `{type:"subscribe", topic:"optimization", id:"<studyId>"}` — gateway 订阅 `event.optimization.progress` + `event.optimization.suggested`，按 studyId 过滤；`optimization.progress` 每 ~5 trial 一条，`optimization.suggested` 是终态（含 `recommendation_id`）。

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

**Polymarket / Polygon 钱包 (Phase 9)**（`gateway/internal/http/handlers/wallet.go` + `prediction.go` + `prediction_strategy.go`）
| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET    | `/api/v1/wallets`                    | Polygon 钱包列表（NO ciphertext） |
| POST   | `/api/v1/wallets`                    | 创建：验证私钥派生地址 → envelope 加密入库 |
| GET    | `/api/v1/wallets/:id`                | 详情（NO ciphertext） |
| DELETE | `/api/v1/wallets/:id`                | 删除 |
| GET    | `/api/v1/wallets/:id/balance`        | 实时 USDC 余额 + allowance（Polygon RPC） |
| GET    | `/api/v1/wallets/:id/positions`      | CTF 1155 outcome token 持仓 |
| POST   | `/api/v1/wallets/:id/approve`        | admin (`X-Admin-Key`) bounded approve；上限 = `portfolio_limits.maxOpenNotionalUsd`；零 cap = 拒；**infinite approve 不可能** |
| GET    | `/api/v1/prediction/markets`         | Timescale 直读；`?category=&active=&limit=&offset=` |
| GET    | `/api/v1/prediction/markets/:id`     | 单 market 详情 |
| GET    | `/api/v1/prediction/quotes`          | `?token_id=&start=&end=`；prediction_quotes 直读 |
| GET    | `/api/v1/prediction/trades`          | `?market_id=&limit=`；prediction_trades 直读 |
| GET    | `/api/v1/prediction/strategies`      | 列表 |
| POST   | `/api/v1/prediction/strategies`      | 创建（risk 三项 + outcome YES/NO 必填） |
| GET    | `/api/v1/prediction/strategies/:id`  | 详情 |
| PUT    | `/api/v1/prediction/strategies/:id`  | 更新 |
| DELETE | `/api/v1/prediction/strategies/:id`  | 删除 |
| POST   | `/api/v1/prediction/strategies/:id/live`              | toggle live；`{enabled, walletId, mode:"mainnet"}`；Polymarket 无 testnet |
| POST   | `/api/v1/prediction/strategies/:id/live/submit-order` | admin manual submit；XADD `command.prediction.submit` |
| GET    | `/api/v1/prediction/strategies/:id/orders`            | `prediction_orders` 列表 |
| POST   | `/api/v1/admin/ingest/prediction`    | admin XADD `command.ingest.prediction`（同 Phase 8 模式） |

WS：`{type:"subscribe", topic:"prediction_strategy", id:"<strategyId>"}` — gateway 订阅 Redis Stream `events`，过滤 `event.prediction_order.{filled|rejected|canceled|updated}` + `strategyId` 匹配。

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
  - `EXTENDED_CONSUMER_DISABLED`（quant 端，Phase 8 新增，可选）— `true` 时
    `quant.runtime.extended_consumer` 不在 lifespan 自动启动；admin
    `POST /api/v1/admin/ingest/<kind>` 仍会写 Redis Stream，但需要操作员
    手动 `python -m quant.runtime.extended_consumer` 或 dockerfile entrypoint
    起独立进程消费。默认（unset）= 自动起。
  - **Phase 6（AI 优化）env vars**（仅 quant worker 读取，gateway 不直接消费）：
    - `ANTHROPIC_API_KEY` — Anthropic SDK 鉴权；为空时优化器跳过所有 Codex 调用
      使用默认 search space + 确定性 fallback rationale（dev 友好）
    - `AI_MAX_USD_PER_STUDY` (default `5.0`) — 每个 study 的硬上限；超过则
      `BudgetGate.try_charge` 返回 false，optimizer 写 `OPT_BUDGET_EXCEEDED` 状态
    - `AI_MAX_USD_PER_DAY` (default `50.0`) — 全局每日上限，按 UTC 日聚合
      `optimization_runs.cost.usdSpent`
    - `AI_MAX_TRIALS_PER_STUDY` (default `200`) — Optuna trial 上限
    - `AI_MAX_SECONDS_PER_STUDY` (default `300`) — Optuna 硬 wall-clock 截断
    - `AI_OPTIMIZATION_DAILY_CRON` (default `0 2 * * *`) — Arq cron schedule；
      仅支持 `M H * * *` 格式
    - `AI_OPTIMIZATION_LOOKBACK_DAYS` (default `90`) — 每个 study 默认拉取的
      OHLCV 历史窗口（小时线）
  - **测试网默认**：gateway 的 Binance 订单适配器 (`exchange/binance/orders.go`)
    构造时根据 `Live.Mode` 把 `futures.BaseURL` pin 到
    `https://testnet.binancefuture.com`（mainnet 需要 env+token gate 同时开
    启才会 pin 到 `https://fapi.binance.com`）。
  - **Phase 7 新增 env**：
    - `RATELIMIT_BACKEND` (quant，default `memory`) — 设为 `redis` 时 quant
      的 token-bucket 走 Redis（共享 Lua 脚本：`HMGET → refill → check → HMSET`，
      过期 5 分钟），多副本部署必须切到 `redis`
    - `OTEL_EXPORTER_OTLP_ENDPOINT` (gateway + quant) — 留空则 trace 走 stdout
      （**默认 stdout 以避免意外的数据外发**），设值后切 OTLP；`/metrics` 端点
      永远开放（建议反向代理仅暴露内网/允许 prometheus IP）
    - `KEK_PROVIDER` (gateway，default `env`) — `env` / `aws-kms` / `gcp-kms`；
      非 env 选项当前为 stub，运行时返回 `ErrKEKNotConfigured`，整合 SDK
      请扩展 `gateway/internal/crypto/kek.go`
    - `AWS_KMS_KEY_ID` / `AWS_REGION` / `GCP_KMS_KEY_NAME` — KMS 路径专用，
      env 路径为空可
    - **Audit 保留期**：`audit` 集合 TTL 索引基于 `expiresAt` 字段，
      默认 7 年（`gateway/internal/store/mongo/audit_repo.go::DefaultAuditRetention`）；
      自动 prune 由 Mongo TTL monitor 处理（默认 60 秒扫一次，文档过期后真正删）
  - **Phase 8 新增 env**（**全部仅 quant worker 读取**；gateway 读 `ADMIN_KEY` 决定 admin/ingest 路由是否暴露）：
    - `FRED_API_KEY` — FRED REST 客户端鉴权；未设时整个 FRED 数据源在
      `FREDClient.__init__` 抛 `ErrAPIKeyNotConfigured`；`run_macro_ingest`
      捕获后跳过 FRED，AKShare CN 部分继续
    - `ETHERSCAN_API_KEY` — 同样 fail-closed；`run_onchain_ingest` 捕获
      后跳过 Etherscan，DefiLlama / blockchain.info 继续
    - `CRYPTOPANIC_TOKEN` （可选）— 提升免费层 rate limit；空字符串时调
      公共 endpoint，无 token
    - `AI_CONTEXT_INCLUDE_EXTENDED` （default = 自动检测）— 默认 `true`
      iff `FRED_API_KEY` 或 `ETHERSCAN_API_KEY` 任一已设；明确写
      `true` / `false` 强制覆盖。开启后优化器在 `_try_define_search_space`
      构建 prompt 时附带 24h 内新闻 top-5 + 最近宏观 + 链上快照
      （走 prompt cache，**不抬高 budget 上限**；超 budget 退化为不带扩展上下文）
    - **Phase 8 paid stub envs**（仅当下要切真 SDK 时设）：
      `POLYGON_API_KEY`（`equities/polygon_stub.py`）、
      `GLASSNODE_API_KEY`、`NANSEN_API_KEY`（`onchain/{glassnode,nansen}_stub.py`）。
      未设时构造时即抛 `ErrAPIKeyNotConfigured`，整合 SDK 的步骤见 §8 ops
  - **Phase 9 新增 env**（Polymarket 预测市场垂直；gateway 直接读取）：
    - `POLYGON_RPC_URL` (default `https://polygon-rpc.com`) — Polygon RPC。
      默认免费公共节点，rate-limited；生产请切 Alchemy/Infura
      （`https://polygon-mainnet.g.alchemy.com/v2/<KEY>`）。**未设 = 绑 NoopRPC**
      （`/wallets/:id/{balance,positions,approve}` 返 503 `ErrRPCNotConfigured`）；
      **设了** = `wallet/polygon/ethrpc.go` 通过 `ethclient.DialContext` 起 `EthClientRPC`，
      USDC.balanceOf / allowance / approve 走 minimal embedded ABI，approve 路径
      `LegacyTx` 签名 + `eth_sendRawTransaction` + 60s receipt poll；
      dial 失败回退到 NoopRPC（带 warning），不阻塞 boot
    - `POLYMARKET_CLOB_URL` (default `https://clob.polymarket.com`) — CLOB REST 端点
    - `POLYMARKET_GAMMA_URL` (default `https://gamma-api.polymarket.com`) — Gamma 元数据端点
    - `POLYMARKET_TRADING_ENABLED` — 必须为字面量 `true` 才进入 Polymarket 三道闸；
      默认未设 = 永远拒。**与 Binance mainnet env 同语义、同 TokenStore（共享单例：
      `/admin/mainnet/confirm` 一次开两个 vertical）**
    - `POLYMARKET_CLOB_EXCHANGE_ADDRESS` (default `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E`) —
      EIP-712 `verifyingContract`；override 仅用于 forked / staging
- **凭证加密**：`gateway/internal/crypto/crypto.go` 提供 AES-256-GCM 封装；
  `option` handler 在 create / update 时透明加密 `userApiKey` 与
  `userSecretKey`，密文格式 `base64(iv).base64(tag).base64(ciphertext)`，
  与原 NestJS 实现 byte-equal（见 `crypto_test.go` golden vector）。
- **接口防泄露**：`domain.Option` 上 `userApiKey` / `userSecretKey` 用
  `json:"-"` 标签剥除，且 `option_repo.go` 的解码路径会忽略 `__v`，
  GET 接口永不返回密钥（即便已加密）。

## 8. 注意事项 / 已知问题

- ~~**`client/app/list/`** 为占位目录。~~ — 已删除（commit `ee22b1c`）。
- ~~**`option/page.tsx`** 表单尚未接通 POST 提交。~~ — 已完整重建为 11 字段
  HeroUI 表单（commit `ee22b1c`），含动态分批表格、提示文、`createOption()`
  接通、成功跳转 `/strategies`。
- ~~**集成测试**：仓库目前缺少端到端 e2e。~~ — 已补：
  `quant/tests/test_e2e_pipeline.py` 跑完整流水线（ingest → /ohlcv 读 →
  /option 建策略 → /optimize → 推荐验证 → 清理），`@pytest.mark.integration`
  默认 `pytest -q` 不跑，`uv run pytest -m integration` 显式跑；
  fixture 在 gateway 不可达时自动 skip，不阻塞离线。
- **Phase 8 付费数据源切换路径**：`quant/data/equities/polygon_stub.py` /
  `quant/data/onchain/{glassnode,nansen}_stub.py` 在构造时即抛
  `ErrAPIKeyNotConfigured`（绝不静默 no-op）。要切真 SDK 三步：
  (1) 在 `quant/pyproject.toml` 加依赖（`polygon-api-client` /
  `glassnode-sdk` 等），(2) 在 stub 文件 `__init__` 改为构造真客户端
  + 实现 `fetch_*` 方法，(3) 在 `workers/extended_ingest.py` 把对应
  cron 加入。Stub 的方法签名已对齐目标 SDK 的常见 shape，避免再次重命名。
  **`AI_CONTEXT_INCLUDE_EXTENDED` 即使为 true，extended context 也不会触发付费
  调用** — 只走免费 FRED/Etherscan/blockchain.info/DefiLlama/CryptoPanic/AKShare
  + RSS。
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
- **AI 推荐必须人工审批**（Phase 6，硬要求）：`ai_recommendations` 始终以
  `status=pending_review` 入库，**不存在 auto-apply 路径**。批准走
  `POST /api/v1/recommendations/:id/approve` 的 Mongo 事务（更新 strategy +
  自增 currentVersion + supersede 同 strategy 其余 pending + emit
  `event.strategy.upserted`）。预算闸 fail-closed：`AI_MAX_USD_PER_STUDY` /
  `AI_MAX_USD_PER_DAY` 任一耗尽，`BudgetGate.try_charge` 返回 false 且
  optimizer 写 `OPT_BUDGET_EXCEEDED` 状态。
- **Kill switch（Phase 7，硬要求）**：`POST /api/v1/admin/halt` 写
  `system_state.tradingHalted=true`，`orderengine.processCommand` 在 *任何*
  per-strategy 风控闸 / 加密 / 交易所调用 *之前* 读这一标志，halted 时直接
  返回 `ErrTradingHalted` 并发 `event.order.rejected`。`SystemRepo` 是
  接口注入，存储错误 fail-closed（拿不到状态 = 拒）。`POST /api/v1/admin/resume`
  清旗。
- **Audit log（Phase 7）**：`gateway/internal/http/middleware/audit.go` 在
  `/api/v1/` 上以 Echo middleware 形式挂载，捕获所有非 GET 请求；payload
  做 JSON 字段递归 scrub（任何包含 `apikey`/`secretkey`/`secret`/`passphrase`/
  `ciphertext`/`password`/`token` 的 key 替换为 `[redacted]`；**Phase 9
  扩展 scrub 列表加 `privatekey`/`mnemonic`/`seed`**，`audit_test.go::
  TestAudit_Phase9_ScrubsWalletKeys` 是这一硬约束的回归保护）。请求体
  上限 64 KiB；非 JSON body 直接替换为占位标注。写盘走异步缓冲通道
  （默认 1024 容量），溢出计数 + 日志 + drop。`/healthz`、`/metrics`、`/ws`
  豁免。
- **Polymarket security model（Phase 9，硬要求）**：
  1. **私钥永不出 API 响应**：`domain.Wallet` 的 `DEKCiphertext` /
     `PrivateKeyCiphertext` 字段使用 `json:"-"`；audit middleware scrub
     列表新加 `privatekey`/`mnemonic`/`seed` patterns（substring，
     case-insensitive），覆盖 `privateKey` / `privateKeyCiphertext` /
     `mnemonic` / `seed` 等所有变体
  2. **三道闸（无 testnet）**：Polymarket 没有 testnet，因此真实下单需要
     全三道闸打开 — (1) 策略 `live.mode == "mainnet"`、(2) env
     `POLYMARKET_TRADING_ENABLED=true`、(3) admin 通过 `/admin/mainnet/
     request-token` → `/admin/mainnet/confirm` 走完 token 流程并在 1 小时
     窗口内（**与 Binance mainnet 共享同一个 `TokenStore` 单例**）。任一
     缺失，`prediction.engine.processCommand` 在风控闸最后一步
     `polymarket.CheckGate` 返回 `ErrMainnetGateDenied`，不会触达 CLOB
  3. **USDC bounded approve**：`/api/v1/wallets/:id/approve` 的 amount
     被硬上限 `portfolio_limits.maxOpenNotionalUsd`；零 cap = 拒
     （`ErrUSDCAllowanceCapZero`），任何超 cap 请求 `ErrApprovalExceedsCap`。
     **infinite approve 在代码层面不可能** — `wallet/polygon/wallet.go::
     ValidateApproveAmount` 是唯一的 approve 入口
  4. **Slippage cap**：`prediction.engine.processCommand` 在签名前 fetch
     CLOB book，比 mid，超 `risk.maxSlippageBps` `ErrSlippageExceeded` 拒
  5. **Polygon RPC**：未设 `POLYGON_RPC_URL` 时绑 `NoopRPC`，所有钱包
     on-chain endpoint（balance / positions / approve）返 503 `ErrRPCNotConfigured`；
     设了 = `wallet/polygon/ethrpc.go::NewEthClientRPC` 通过 `ethclient.DialContext`
     起 `EthClientRPC`，USDC.balanceOf / allowance 走 `eth_call`，approve 走
     `LegacyTx` 签名 + `eth_sendRawTransaction` + 最长 60s `eth_getTransactionReceipt`
     轮询；reverted = `ErrApproveTxReverted`，超时 = `ErrApproveReceiptTimeout`。
     dial 失败时回退 NoopRPC（warning 日志），不阻塞 boot。
     CTFBalances 当前返空（subgraph 集成预留接口缝），ERC1155 outcome token
     余额请暂时通过 Polymarket 数据 API 查询；生产推荐 `POLYGON_RPC_URL` 切
     Alchemy/Infura，免费公共节点 rate-limited
  6. **EIP-712 typed-data 签名**：domain `Polymarket CTF Exchange / 1 /
     chainId=137 / verifyingContract=0x4bFb...82E`；order type 12 个字段；
     golden vector 测试 `signer_test.go` pin 了 type-hash + 域分隔器 +
     最终 digest，任何字段调整都会触发显式失败
- **KMS 切换流程（Phase 7）**：`crypto.KEKProvider` 接口三方实现：
  `EnvKEKProvider`（默认，沿用 NestJS golden vector byte-equal）/
  `AWSKMSKEKProvider` / `GCPKMSKEKProvider`（后两个是 stub，运行时返回
  `ErrKEKNotConfigured`）。切换路径：(1) 设 `KEK_PROVIDER=aws-kms`
  + `AWS_KMS_KEY_ID` + `AWS_REGION`；(2) 在 `kek.go` 把 stub 实现替换为
  AWS SDK `kms.Encrypt/Decrypt` 调用（注释里有完整 call shape）；
  (3) 滚动重启 — 已有 DEK ciphertext 仍由 env KEK 解密直到通过 admin
  rotate 工具搬到新 KEK；新写的 DEK 走新 provider。`EnvelopeService` 拿
  provider 而非 master key，所以切 KMS 不动 envelope 调用方。

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
- [x] **Phase 6**：AI 自动优化循环
      - `quantpb/v1` 落地 `StartOptimization` / `GetOptimizationStatus` /
        `StreamOptimizationProgress`（`OptimizationState` 5 值枚举）；
        `eventspb/v1` 加 `OptimizationProgress` / `OptimizationSuggested`
      - `quant/ai/`：Anthropic SDK 包装（system prompt + study-context block 用
        `cache_control={type:ephemeral}` 缓存，1h ttl 路径预留）；硬编码 Sonnet 4.6
        ($3/M 入 / $15/M 出) + Haiku 4.5 ($1/M / $5/M) 价格表；Optuna TPE +
        MedianPruner；**walk-forward 70/30 IS/OOS gate（OOS sharpe < 0.7×IS sharpe
        直接 -inf 拒绝，单测覆盖）**
      - `quant/data/recommendations.py`：`ai_recommendations` + `optimization_runs`
        集合写路径；status 流转 `pending_review → approved | rejected | superseded`
      - `quant/workers/optimize.py`：单 strategy 全循环（载历史 → Codex define
        space → Optuna 跑 trials → mid-study Haiku refine（可选）→ Codex rationale
        → 写 Mongo + 发 Redis Stream）；Arq cron 每日 02:00 UTC（env 可改）扫
        `live.enabled=true OR optimizationEnabled=true` 策略并 enqueue
      - gateway `recommendation_repo.go` + `optimization_run_repo.go` +
        `recommendation.go`(approve/reject/list/detail) + `optimization.go`
        (POST /strategies/:id/optimize, GET /optimizations*)；approve 走
        Mongo session+tx：写 strategy + 自增 currentVersion + supersede 同
        strategy 其余 pending + 发 `event.strategy.upserted`
      - WS `redis_optimization.go` + `(kind=optimization, id=studyId)` topic
      - UI `(dashboard)/recommendations/{page,[id]/page,actions}.tsx` 列表/diff/
        approve；strategy 详情 "Tune now" 按钮 + `useOptimizationStream` live cost
        meter；`api-client.ts` + `type.d.ts` 加齐 6 个新接口
- [x] **Phase 7**：加固
      - portfolio kill switch（`system_state` 集合 + `/admin/halt|resume|system-state`
        + UI 红条 banner + engine 在风控闸前先检查）
      - 跨策略 portfolio 限额（`portfolio_limits` 集合 + `/admin/portfolio-limits`
        + engine `SumOpenNotionalForUser` / `SumRealisedPnlSinceForUser` aggregate）
      - append-only `audit` 集合（TTL 7 年默认）+ Echo middleware（异步
        buffered，scrub `apiKey`/`secret*`/`*passphrase*`/`*Ciphertext`）+
        `/admin/audit` 列表 + UI `(dashboard)/admin/audit`
      - quant `RATELIMIT_BACKEND=redis`（同样的 token-bucket 算法走 Lua + EVALSHA
        + 5 分钟 PEXPIRE；fakeredis 用 HSET-only emulation 跑测试）
      - `crypto.KEKProvider` 接口（env / aws-kms stub / gcp-kms stub）；
        `EnvelopeService` 改成接受 provider；Phase 0 golden vector 仍 byte-equal
      - 进程内 Prometheus 计数器/直方图 + `/metrics` endpoint（gateway+quant），
        默认 stdout tracer（OTel OTLP 走 env）；Grafana dashboards 检入 JSON
      - `infra/scripts/{backup,restore}-{mongo,timescale}.sh`（commit-only，
        含 README + RPO/RTO 说明）
      - `infra/k8s/`（Deployments / StatefulSets / Ingress / HPA / kustomization；
        secret 为占位 example）
      - `.github/workflows/ci.yml`：Go vet/test/build + ruff + pytest + yarn
        lint/build，三 job 并行
- [x] **Phase 8**：数据源全集
      - 股票：`quant/data/equities/{akshare_cn,yfinance_intl,polygon_stub}.py`
        — A 股 daily/intraday qfq + intl `Ticker.history()`；存储复用 `ohlcv`
        表，symbol 形如 `<code>.<exchange>`
      - 期货：`quant/data/futures/akshare_cn.py` — SHFE/DCE/CZCE/CFFEX
        合约日 K（`futures_zh_daily_sina`）；存储复用 `ohlcv`
      - 宏观：`quant/data/macro/{fred,akshare_cn}.py` + 新表
        `macro_indicators(source, code, ts, value, unit)`（30 天分块 hypertable）；
        FRED 默认序列 `CPIAUCSL/UNRATE/FEDFUNDS/DFF/DGS10/M2SL`
      - 链上：`quant/data/onchain/{defillama,etherscan,blockchain_info,glassnode_stub,nansen_stub}.py` +
        新表 `onchain_metrics(source, chain, metric, ts, value)`（7 天分块）；
        付费源 fail-closed 抛 `ErrAPIKeyNotConfigured`
      - 新闻：`quant/data/news/{cryptopanic,akshare_cn,rss_aggregator,sentiment}.py` +
        新表 `news_events(id, source, ts, title, url, body, sentiment, symbols[])`
        + GIN(symbols) + GIN(simple to_tsvector(title||body)) + ts desc btree；
        sentiment 是 lexicon 占位（FinBERT swap = 实现 `LexiconSentiment.score` 替代）
      - Gateway：`store/timescale/{macro,onchain,news}.go` + `handlers/data_explorer.go`
        — 5 个读端点 + 5 个 `POST /api/v1/admin/ingest/<kind>` admin XADD 端点
      - Quant：`workers/extended_ingest.py`（5 个 `run_*_ingest` + 5 个 Arq
        函数 + 4 条 cron）+ `runtime/extended_consumer.py`（消费 admin
        XADD 的 `command.ingest.<kind>` 流并 dispatch）；**`quant/main.py`
        lifespan 在启动时自动起 `extended_consume_loop` 任务**，配 env
        `EXTENDED_CONSUMER_DISABLED=true` 关闭（mirror Phase 4 的
        `QUANT_RUNTIME_DISABLED`），保证 admin XADD 端点不会写进无消费者的
        队列。Cron 仍是周期性 ingest 的主路径，consumer 只服务于交互式 ad-hoc 触发。
      - AI：`ai/extended_context.py`（24h 新闻 top5 + 最新宏观 + 链上快照），
        默认 iff `FRED_API_KEY` 或 `ETHERSCAN_API_KEY` 已设；进入 Anthropic
        prompt-cache 块；**不抬高 budget 上限**，超 budget 退化为基础上下文
      - UI：`(dashboard)/data-explorer/{equities,futures,macro,onchain,news}/page.tsx`
        + 侧栏入口 + `client/data/api-client.ts` 5 个新接口 + 3 个新类型
      - SQL：`infra/timescale/003_extended_data.sql`（idempotent，
        docker-compose initdb.d 自动 apply，已存在的 hypertable 不影响）
      - 测试：29 个 pytest（offline，respx + monkeypatch）+ 4 个 Go handler
        测试（store-nil/admin-key 网格）；`go test`/`yarn build` 全绿
- [x] **Phase 9**：Polymarket 完整接入（独立预测市场垂直）
      - 钱包层 `gateway/internal/wallet/polygon/{wallet,rpc,wallet_test}.go` —
        私钥 envelope 加密（同 KEK provider 切 KMS 一并迁），address 派生 +
        校验，USDC bounded approve（cap = `portfolio_limits.maxOpenNotionalUsd`，
        zero cap = 拒，infinite approve 不可能），CTF 持仓接口；`RPC` 接口
        + `NoopRPC` 默认 + `MemoryRPC` 测试用；ethclient 实现接缝待补 PR
      - Polymarket 适配器 `gateway/internal/prediction/polymarket/{client,signer,gate,*_test}.go` —
        CLOB REST（book/trades/order/orders）+ EIP-712 typed-data signer
        （golden vector 测试 pin 域分隔器 + order type-hash + 最终 digest +
        sign/recover 往返）+ 3-gate（共享 Phase 4 `TokenStore`，env =
        `POLYMARKET_TRADING_ENABLED`）
      - 预测引擎 `gateway/internal/prediction/engine/{engine,reconcile,
        engine_test}.go` — 独立 worker pool 消费 Redis Stream
        `command.prediction.submit`；风控闸顺序：kill switch → live/risk
        present → maxNotionalUsd → maxOpenMarkets → maxSlippageBps（vs.
        live mid） → daily loss cap → portfolio cap → mainnet 3-gate；
        `clientOrderId = sha256("polymarket:" + strategyId + marketId +
        outcome + bar)` 32 hex 幂等；30s reconcile loop 标记
        local-but-not-remote 为 `unknown`
      - Mongo `polygon_wallets` / `prediction_strategies` / `prediction_orders`
        三集合 + 索引；TimescaleDB `prediction_markets` (PK = market_id,
        non-hypertable) + `prediction_quotes` + `prediction_trades`
        (hypertables 7d 分块) — `infra/timescale/004_prediction.sql`
      - Gateway endpoints `/api/v1/wallets/*` + `/api/v1/prediction/*` +
        `/api/v1/admin/ingest/prediction`；WS topic `prediction_strategy`
        过滤 `event.prediction_order.*` + `strategyId` 匹配
      - Quant `quant/data/prediction/{polymarket_gamma,polymarket_clob,
        polymarket_ws,types}.py` — Gamma 元数据 + CLOB REST 客户端 + WS
        客户端（默认 `websockets`-backed connect_factory，`{type: "Market",
        assets_ids: [...]}` 订阅；测试通过 fake factory 注入 offline）+
        共享数据类
      - Quant 策略 `quant/strategies/polymarket_event.py` — 偏离-vs-prior
        信号 + binary outcome PnL helper（resolve 时 winner-take-all）
      - 审计扩展 `audit.go` scrub 列表加 `privatekey`/`mnemonic`/`seed`；
        `audit_test.go::TestAudit_Phase9_ScrubsWalletKeys` 是回归保护
      - UI `(dashboard)/wallets/{page,new,[id]}/page.tsx` + `(dashboard)/
        prediction/{markets,strategies}/*` + 侧栏入口 + `client/data/
        {api-client.ts,type.d.ts}` 12 个新接口 + 9 个新类型
      - 新 Go dep：`github.com/ethereum/go-ethereum`（EIP-712 keccak +
        ECDSA + address 派生 + IsHexAddress + ethclient + abi for
        production EthClientRPC）；新 Python dep：`websockets>=12`（默认
        connect_factory）
      - 测试：22 个 pytest 新增（offline，respx）+ 13 个 Go 单测
        （signer golden vector + wallet round-trip + engine risk gate）；
        `go test ./...` / `uv run pytest -q` / `yarn lint && yarn build`
        全绿
- [ ] 期权配置表单接通 POST 提交
- [ ] `client/app/list/` 实现

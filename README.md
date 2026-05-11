# finance_next

加密货币 / 期权 / 预测市场策略管理工具的原型。维护策略配置（杠杆、止盈止损、
分批补仓、交易所凭证），支持回测、AI 自动优化（人工审批后才落地）、跨交易所
（Binance / OKX / Bybit）实盘下单、Polymarket 预测市场，以及覆盖股票 / 期货
/ 宏观 / 链上 / 新闻的扩展数据视图。

## 仓库结构

monorepo，每个子工程独立 build：

- `client/` — Next.js 16 前端（App Router、HeroUI、Tailwind 4）
- `gateway/` — Go 1.23+ 网关（Echo v4、MongoDB、订单引擎、风控闸）
- `quant/` — Python 量化 worker（FastAPI + gRPC + Optuna + Anthropic SDK）
- `shared-proto/` — protobuf 单一来源，Go / Python 生成代码已检入
- `infra/` — docker-compose / Timescale DDL / Grafana 看板 / k8s manifest

后端架构与各 phase（0-9）的实现细节见 [CLAUDE.md](./CLAUDE.md)。

## 快速开始

```bash
# 1. 准备项目根 .env（参考 gateway/.env.example）
cp gateway/.env.example .env
# 至少填写 MONGODB_URI 和 ENCRYPTION_KEY。生成 ENCRYPTION_KEY：
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 2. 启动整套依赖栈（Mongo / Redis / Timescale / Go gateway / Python quant）
docker compose -f infra/docker-compose.yml up --build

# 3. 启动前端 dev server
cd client && yarn install && yarn dev
# 打开 http://localhost:3000
```

健康检查：

- 前端 — http://localhost:3000
- Gateway REST — http://localhost:3001/api/v1/...
- Quant FastAPI — http://localhost:8000/healthz

## 环境变量

`.env` 在项目根，由 `infra/docker-compose.yml` 通过 `env_file` 加载，同时
`gateway/cmd/gateway/main.go` 用 godotenv 在裸机 dev 模式下读取。必填项：

- `MONGODB_URI` — Mongo Atlas / 自建 Mongo 完整连接串（含库名）
- `ENCRYPTION_KEY` — 32 字节十六进制（64 字符）

可选项（详见 CLAUDE.md §7）：`ADMIN_KEY` / `MAINNET_TRADING_ENABLED` /
`POLYMARKET_TRADING_ENABLED` / `POLYGON_RPC_URL` / `ANTHROPIC_API_KEY` /
`FRED_API_KEY` / `ETHERSCAN_API_KEY` 等。

## 常用命令

```bash
# 前端
cd client
yarn dev / yarn build / yarn lint / yarn typecheck / yarn check

# Go gateway
cd gateway
go run ./cmd/gateway          # 默认 :3001
go test ./... && go vet ./...

# Python quant
cd quant
uv sync --extra dev
uv run python -m quant.main                              # FastAPI + gRPC
uv run arq quant.workers.settings.WorkerSettings         # Arq 后台
uv run pytest -q && uv run ruff check .
```

## 安全契约

实盘下单（Binance mainnet / Polymarket）需要 **三道闸全部打开**：策略
`live.mode=mainnet` + env `*_TRADING_ENABLED=true` + admin token 流程在 1
小时窗口内。任一缺失即拒。AI 推荐永远 `pending_review`，无 auto-apply 路径。
完整安全模型见 CLAUDE.md §8。

## 详细文档

- [USAGE.md](./USAGE.md) — **日常使用指南**：抓行情 / 建策略 / AI 优化 / 审批推荐 / 监控运维 / 错误诊断
- [CLAUDE.md](./CLAUDE.md) — 架构参考：数据模型、完整 API 表、各 phase 历史、安全契约

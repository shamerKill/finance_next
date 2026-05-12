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

## 5 分钟启动（开发）

```bash
git clone <repo> && cd finance_next

# 1. 拷贝 env 模板并填入两个 32 字节 hex 密钥
cp .env.example .env
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))" >> .env
node -e "console.log('AUTH_JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" >> .env
$EDITOR .env    # 按需调其它项（MONGODB_URI / ADMIN_KEY ...）

# 2. 预飞行校验（必填 / hex 长度 / 常见误配警告）
bash infra/scripts/check-env.sh

# 3. 启整套栈（Mongo + Redis + Timescale + gateway + quant）
docker compose -f infra/docker-compose.yml up -d --build
# 等约 30 秒所有服务 healthy（compose 内置 healthcheck）

# 4. 验证
curl http://localhost:3001/healthz | jq    # 含 deps 状态
curl http://localhost:8000/readyz | jq     # quant 就绪状态

# 5. 启前端
cd client && yarn install && yarn dev
# 浏览器访问 http://localhost:3000 → 第一次注册自动成为 admin
```

详细部署文档见 `docs/deployment/`（Wave 4 后续节点持续补充）。
完整 quickstart 步骤、常见快速失败诊断见 [docs/deployment/01-quickstart.md](./docs/deployment/01-quickstart.md)。

## 快速开始（旧路径，兼容保留）

```bash
# 1. 准备项目根 .env（参考 .env.example）
cp .env.example .env
# 至少填写 MONGODB_URI、ENCRYPTION_KEY、AUTH_JWT_SECRET。

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

## 生产部署 (prod)

`infra/docker-compose.prod.yml` 是 production override，**叠加**在主 compose
文件上：删除所有 host port 映射（仅 Caddy 暴露 :80/:443）、`restart: always`、
启用 `AUTH_COOKIE_SECURE`、加入 Caddy 反向代理（自动 Let's Encrypt TLS）。

```bash
# 1) 准备 .env（必填项 + AUTH_COOKIE_SECURE 由 prod override 自动注入）
cp .env.example .env && $EDITOR .env

# 2) 设置域名（Caddy 自动签 TLS；不设走 localhost 自签）
export DOMAIN=trading.example.com

# 3) 启动
docker compose \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.prod.yml \
  up -d

# 4) 验证
curl -k https://$DOMAIN/api/v1/auth/me  # 401 未登录是预期
```

注意：前端 (`client/`) 不在 compose 内。Caddyfile 默认把 `/` 反代到
`host.docker.internal:3000`；生产请改为独立 `frontend` 服务或静态导出。
完整 prod checklist（env / TLS / backup / kill switch / 升级 / KMS / 监控 /
安全 hardening）见 [docs/deployment/02-production.md](./docs/deployment/02-production.md)。

## 开发 (dev override，hot reload 友好)

`infra/docker-compose.dev.yml` 暴露所有数据库端口（mongo/redis/timescale），
开启 `LOG_LEVEL=debug`、tty/stdin，源代码 bind-mount 进容器只读以便从容器内
查看 source；Go binary / Python 进程不会自动重启，改完后
`docker compose restart gateway` 即可。

```bash
docker compose \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.dev.yml \
  up
```

部署遇 bug 时按错误信息查 [docs/deployment/03-troubleshooting.md](./docs/deployment/03-troubleshooting.md)。

## 详细文档

- [USAGE.md](./USAGE.md) — **日常使用指南**：抓行情 / 建策略 / AI 优化 / 审批推荐 / 监控运维 / 错误诊断
- [CLAUDE.md](./CLAUDE.md) — 架构参考：数据模型、完整 API 表、各 phase 历史、安全契约

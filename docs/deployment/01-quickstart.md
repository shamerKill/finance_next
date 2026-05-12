# 部署 Quickstart（5 分钟跑起来）

> 目标读者：第一次部署 finance_next 的人。
> 走完本文档后，你会有一套本机能跑通的开发环境（Mongo / Redis / Timescale /
> gateway / quant + 前端 dev server），并能登录 dashboard。

如果你要上生产环境，先把这篇看完再读 `02-production.md`；
遇到错误信息时翻 `03-troubleshooting.md`。

## 前提

- macOS / Linux（Windows 请用 WSL2）
- Docker Desktop 或 Docker Engine + Docker Compose v2（`docker compose` 子命令，
  注意是空格不是连字符）
- 4 GB 可用内存、10 GB 可用磁盘（Mongo / Timescale 各占一些 volume）
- Node 20 + Yarn 1.x（仅启前端时需要；后端全在容器里）
- 端口空闲：3000（前端） / 3001（gateway） / 8000（quant FastAPI） /
  27017（mongo） / 6379（redis） / 5432（timescale）

## 第 1 分钟：clone + 生成 secrets

```bash
git clone <repo-url> finance_next
cd finance_next

# 拷贝 env 模板
cp .env.example .env

# 生成两个 32-byte hex 密钥（直接 append 到 .env）
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
echo "AUTH_JWT_SECRET=$(openssl rand -hex 32)" >> .env

# 如果没有 openssl（罕见）：
#   node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))" >> .env
#   node -e "console.log('AUTH_JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" >> .env

# 打开 .env 检查一下；其余默认值（MONGODB_URI 指向容器 mongo、REDIS_URL
# 指向容器 redis、TIMESCALE_DSN 指向容器 timescale）已经够本地用。
$EDITOR .env
```

`.env.example` 里有详尽注释，每个变量做什么、空值的副作用都写清楚了。
本步**不要**改 `MONGODB_URI` / `REDIS_URL` / `TIMESCALE_DSN`，保留默认即可
（它们指向 docker-compose 内部的服务名，本机网络外不可达）。

> **重要**：`ENCRYPTION_KEY` 一旦改值，所有已加密的交易所凭证 / 私钥
> 立即失效。`AUTH_JWT_SECRET` 改值 = 全员强制重新登录。生成一次就别动。

## 第 2 分钟：env 校验

```bash
bash infra/scripts/check-env.sh
```

预期输出 `OK .env 校验通过`。校验项：

- `MONGODB_URI` / `ENCRYPTION_KEY` / `AUTH_JWT_SECRET` / `REDIS_URL` 非空
- `ENCRYPTION_KEY` / `AUTH_JWT_SECRET` 是 64 个 hex 字符（32 字节）
- 常见误配警告：`AUTH_COOKIE_SECURE=false` + 公网部署、
  `ALLOWED_ORIGINS` 含 `*` 但开了 credentials、`MAINNET_TRADING_ENABLED=true`
  没走 admin token 流程，等等

如果失败：照着错误信息修 `.env`，再跑一次。常见错误参见
`03-troubleshooting.md`。

## 第 3–4 分钟：拉栈 + 等 healthy

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

第一次会拉 mongo / redis / timescale 镜像并 build gateway + quant
（gateway Go 编译 ~30s，quant uv sync + 安装依赖 ~60-120s）。

等待所有服务变 healthy：

```bash
docker compose -f infra/docker-compose.yml ps

# 正常态：5 个服务都是 Up + (healthy)
# NAME              STATUS                    PORTS
# fn_mongo          Up X seconds (healthy)    0.0.0.0:27017->27017/tcp
# fn_redis          Up X seconds (healthy)    0.0.0.0:6379->6379/tcp
# fn_timescale      Up X seconds (healthy)    0.0.0.0:5432->5432/tcp
# fn_gateway        Up X seconds (healthy)    0.0.0.0:3001->3001/tcp
# fn_quant          Up X seconds (healthy)    0.0.0.0:8000->8000/tcp
```

如果某个服务一直 `starting` 或 `unhealthy`：

```bash
docker compose -f infra/docker-compose.yml logs gateway --tail 50
docker compose -f infra/docker-compose.yml logs quant --tail 50
```

最常见原因见下面 [常见快速失败](#常见快速失败) 段。

健康检查的 HTTP 端点：

```bash
curl -sf http://localhost:3001/healthz | jq .
# {"status":"ok","deps":{"mongo":"ok","redis":"ok",...}}

curl -sf http://localhost:8000/readyz | jq .
# {"status":"ready",...}
```

## 第 5 分钟：前端 + 第一次登录

前端**不在** compose 里（开发友好，热重载），单独起：

```bash
cd client
yarn install   # 第一次安装依赖
yarn dev       # http://localhost:3000
```

浏览器打开 `http://localhost:3000`：

1. 第一次进入会跳到登录页（gateway 设了 cookie 但无 user）。
2. 点击「注册」按钮，填邮箱 + 密码。
3. **第一个注册的 user 自动成为 admin**（这是设计：避免 bootstrap 阶段需要
   配 ADMIN_KEY 才能初始化）。
4. 注册成功后看到 dashboard 主页 + 左侧导航（Strategies / Markets /
   Backtests / Portfolio / Wallets / Prediction / Admin / Data Explorer）。
5. 验证 admin 权限：访问 `/admin/audit`，应能看到刚刚的 register 事件
   出现在审计日志里。

至此本机栈就跑起来了。

## 接下来做什么

- 抓行情数据：CLAUDE.md §5 的 `POST /api/v1/admin/ingest/...`
  系列端点 + `USAGE.md`。
- 建策略 + 回测：左侧导航 `Strategies` → `New` → `Backtests` → `New`。
- AI 优化：策略详情页 `Tune now` 按钮（需配 `ANTHROPIC_API_KEY`，否则
  走确定性 fallback）。
- 真实下单（mainnet）：先读 `02-production.md` 的三道闸说明，**不要在
  dev 环境直接开**。

## 关停与重置

```bash
# 停服务但保留 volume（数据还在）
docker compose -f infra/docker-compose.yml down

# 停服务 + 删 volume（完全重置，慎用）
docker compose -f infra/docker-compose.yml down -v
```

## 常见快速失败

> 详细分类见 `03-troubleshooting.md`。这里只列最常见的 5 类，让你能
> 在 quickstart 阶段不卡壳。

### `X 缺失必填变量: ENCRYPTION_KEY ...`

检查 `.env` 是否真的被填了；`echo ... >> .env` 是 append，多跑几次可能
追加了空行或重复 key。`grep ENCRYPTION_KEY .env` 看一下。

### `X ENCRYPTION_KEY: 长度 N，需要 64 hex chars (32 bytes)`

用 `openssl rand -hex 32` 生成（不要 `base64`，会带 `=` 末尾）。
重新写入：

```bash
sed -i.bak '/^ENCRYPTION_KEY=/d' .env
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
```

### `fn_gateway` 一直 `unhealthy`

```bash
docker compose -f infra/docker-compose.yml logs gateway --tail 100
```

最常见两种：

- `failed to connect to mongo: ...` → mongo 还没起好，等 20 秒；或者
  `MONGODB_URI` 改成了云端但网络不通。
- `ENCRYPTION_KEY must be 32 bytes hex` → 跑一遍 `check-env.sh`。

### `fn_quant` 一直 `unhealthy`

```bash
docker compose -f infra/docker-compose.yml logs quant --tail 100
```

- `connection refused (timescale:5432)` → timescale 还没初始化完成，再等
  30 秒（首次启动要 apply `infra/timescale/*.sql`）。
- `RuntimeError: ARQ_REDIS_URL ...` → 通常不会触发（默认不依赖 Arq）；如
  果出现，把 `ARQ_REDIS_URL` 留空或不要设。

### 前端打开看到 `Failed to fetch`

dev server 默认调 `http://localhost:3001/api`；如果 gateway 没起或
端口被占了，会一直 fetch 失败。检查：

```bash
curl http://localhost:3001/healthz
lsof -iTCP:3001 -sTCP:LISTEN     # 看谁在监听
```

### 注册接口返 `409 conflict` / `403 forbidden`

403 = `ALLOWED_ORIGINS` 不含浏览器 origin。默认是 `http://localhost:3000`，
如果你改了端口或用 IP 访问，加进去。
409 = 用户已存在，直接登录即可。

---

如果以上都没碰到，本机部署完成。生产部署见
[`02-production.md`](./02-production.md)。

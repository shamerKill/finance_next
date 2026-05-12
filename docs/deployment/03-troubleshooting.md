# 部署故障排查（Troubleshooting）

> 按"错误信息 → 原因 → 修法"组织。先 `Ctrl+F` 搜你看到的 log / HTTP code，
> 找到对应条目再读。

## 启动 / 配置类

### `X 缺失必填变量: ENCRYPTION_KEY / AUTH_JWT_SECRET / MONGODB_URI / REDIS_URL`

来自 `infra/scripts/check-env.sh`。

**原因**：`.env` 里这些 key 是空字符串或不存在。

**修法**：

```bash
grep -E '^(ENCRYPTION_KEY|AUTH_JWT_SECRET|MONGODB_URI|REDIS_URL)=' .env
# 任何一行右边是空 → 填值

echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
echo "AUTH_JWT_SECRET=$(openssl rand -hex 32)" >> .env
# MONGODB_URI / REDIS_URL 默认走容器内服务，照 .env.example 抄
```

再跑 `bash infra/scripts/check-env.sh` 确认。

### `X ENCRYPTION_KEY: 长度 N，需要 64 hex chars (32 bytes)`

**原因**：值不是 64 个 hex 字符。常见错：

- 用了 base64 而不是 hex（base64 32 字节是 44 字符且含 `=`）
- 复制时漏字符 / 多空格

**修法**：

```bash
# 删掉旧的
sed -i.bak '/^ENCRYPTION_KEY=/d' .env

# 生成新的
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env

# 校验
grep ENCRYPTION_KEY .env | awk -F= '{print length($2)}'
# 必须输出 64
```

`AUTH_JWT_SECRET` 同理。

### `mongo: failed to connect` / `gateway` 一直 unhealthy

```bash
docker compose -f infra/docker-compose.yml logs gateway --tail 50
# ... level=error msg="failed to connect to mongo: server selection error: ..."
```

**原因**：

1. mongo 容器没起好 → gateway 抢跑了
2. `MONGODB_URI` 指向云端（Atlas）但 IP 没在 allowlist
3. `MONGODB_URI` 漏了库名（`mongodb://host:27017` 应为 `mongodb://host:27017/finance`）

**修法**：

```bash
docker compose -f infra/docker-compose.yml ps mongo
# STATUS 必须是 healthy

# 重试一次（compose depends_on 已配 service_healthy，但首启慢的话还是会撞）
docker compose -f infra/docker-compose.yml restart gateway

# 看 MONGODB_URI 是否含库名
grep MONGODB_URI .env
# mongodb://mongo:27017/finance   ← 必须有 /finance
```

云端 Atlas：去 Atlas UI → Network Access → 加 server IP / `0.0.0.0/0`（仅 dev 用，prod 强烈建议白名单）。

### gateway 健康但 quant 起不来

```bash
docker compose -f infra/docker-compose.yml logs quant --tail 100
```

常见三种：

#### `psycopg / asyncpg connection refused: timescale:5432`

timescale 第一次启动要 apply `infra/timescale/*.sql`，需要 30–60 秒。
等等再 `docker compose ps`。如果一直失败：

```bash
docker compose -f infra/docker-compose.yml logs timescale --tail 50
# 看是不是 init SQL 报错
```

#### `ImportError: ... anthropic ...`

quant Dockerfile 没装上 anthropic SDK（罕见，通常是 build 缓存问题）。
`docker compose build --no-cache quant` 重建。

#### `RuntimeError: TIMESCALE_DSN required`

`.env` 漏 / 写错 `TIMESCALE_DSN`。compose 默认注入
`postgres://app:app@timescale:5432/finance`，如果你在 `.env` 里覆盖了
请改回。注意：`ANTHROPIC_API_KEY` 留空**完全 OK**（优化器走 fallback），
但 `TIMESCALE_DSN` 错就会让 quant boot 失败。

### Caddy 起不来 / 一直拿不到证书

```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml logs caddy --tail 100
```

常见：

- `DOMAIN=localhost` → Caddy 用 self-signed cert（浏览器红锁是预期）。要真证书必须 `export DOMAIN=<your-domain>` 再 `up -d`
- `[ERROR] obtaining certificate: ... DNS problem` → DNS 还没生效，等 5–60 分钟或检查 A 记录
- `[ERROR] ... timeout waiting for ACME challenge` → 80 端口没对外开放，Let's Encrypt HTTP-01 验证失败

## 鉴权 / CORS 类

### `/api/v1/auth/me` 一直返 401

**原因**：cookie 没被浏览器发送或 gateway 没接受。

**修法**：

```bash
# 浏览器 DevTools → Application → Cookies
# 看有没有 `fn_session`（或类似）cookie

# 如果有 cookie 但请求没带：
# 1) 看 Network → Request → Headers → Cookie 字段
# 2) 看 Response 是不是 `Set-Cookie` 含 Secure 但你是 http 访问（cookie 不会发）
```

最常见：`AUTH_COOKIE_SECURE=true` + 浏览器走 http → cookie 永远不被发送。
dev 改 `AUTH_COOKIE_SECURE=false`；prod 必须 https。

### 浏览器请求被 CORS 拒（Console: `... has been blocked by CORS policy`）

```
Access to fetch at 'https://api.example.com/api/v1/...' from origin
'https://app.example.com' has been blocked by CORS policy
```

**原因**：`ALLOWED_ORIGINS` 没包含浏览器 origin。

**修法**：

```bash
grep ALLOWED_ORIGINS .env
# 必须含完整 scheme + host + port 的 origin
# 例：ALLOWED_ORIGINS=https://app.example.com,http://localhost:3000

# 改完重启 gateway
docker compose restart gateway
```

注意：`ALLOWED_ORIGINS` **不能含 `*`** — 与 `AllowCredentials=true` 互斥，
浏览器会丢 cookie。`check-env.sh` 会给警告但不阻塞，请认真对待。

### WS 一直断连 + 不带 cookie

dashboard 实时事件流走 `/ws`；如果一直 401 reconnect：

**原因 1**：Caddy 反代 `/ws` 没配置或丢了 cookie。

```bash
# 看 Caddyfile 必须有这两块
grep -A2 'handle /ws' infra/caddy/Caddyfile
```

默认 Caddyfile 已 cover，如果你自己改过，确认没删。

**原因 2**：跨域 cookie 未发。WS 握手与普通请求遵循同样的 cookie/CORS
规则，origin 必须在 `ALLOWED_ORIGINS` 里。

### 调 admin 端点全部返 404

**原因**：`ADMIN_KEY` 为空 → 整组 `/api/v1/admin/*` 路由不注册（CLAUDE.md §7）。

**修法**：

```bash
echo "ADMIN_KEY=$(openssl rand -hex 32)" >> .env
docker compose restart gateway

# 调用时必须带 header
curl -H "X-Admin-Key: <value>" https://<your-domain>/api/v1/admin/system-state
```

### `claim-legacy` 返 `403 forbidden: must be sole admin`

**原因**：当前 user 数据库里有多于一个 admin，安全保护拒绝。

**修法**：

直接 mongo shell 检查：

```bash
docker compose exec mongo mongosh finance --eval \
  "db.users.find({role:'admin'}, {email:1}).pretty()"
```

如果有多个 admin，要么把不需要的 admin 降级到 user，要么放弃 claim-legacy
直接手动给文档加 `userId`。

## 加密 / Token 类

### `failed to encrypt` / `failed to decrypt`

```
level=error msg="failed to decrypt accountSecret: cipher: message authentication failed"
```

**原因**：`ENCRYPTION_KEY` 被改了，已加密的 ciphertext 用新 key 无法解密。

**修法**（按严重程度）：

1. 如果还知道旧 key → 改回 `.env`，重启
2. 如果旧 key 丢了 → **数据无法恢复**。删掉所有 `accounts` / `polygon_wallets` 文档，
   重新录入凭证。最坏情况下从 backup 还原整个 mongo
3. 长期方案：用 KMS 托管 KEK（CLAUDE.md §8），避免手抖

### `401 unauthorized` 持续 + cookie 还在

**原因**：JWT secret 改过或 cookie 过期。

**修法**：登出再登入。如果是 `AUTH_JWT_SECRET` 改了 → **所有 user** 都会
被强制退登，这是预期行为（CLAUDE.md §7 已说明）。

## 业务逻辑类

### mainnet 下单永远拒（`ErrMainnetGateDenied`）

CLAUDE.md §8 硬约束：实盘下单需要**三道闸全部打开**。任一缺失即拒。

**修法**：按顺序检查：

```bash
# 闸 1: 策略本身
curl -sf https://<your-domain>/api/v1/strategies/<id> -H "Cookie: ..." | jq .live
# 必须看到 {"enabled": true, "mode": "mainnet", "accountId": "..."}

# 闸 2: env
grep MAINNET_TRADING_ENABLED .env
# 必须是字面量 true（不是 1 / yes / True）

# 闸 3: admin token
curl -sf https://<your-domain>/api/v1/admin/mainnet/status \
  -H "X-Admin-Key: $ADMIN_KEY" | jq .
# {"envEnabled": true, "mainnetAllowed": true, "expiresAt": "..."} ← 必须 mainnetAllowed=true
```

如果 `mainnetAllowed=false`，走 token 流程：

```bash
curl -X POST https://<your-domain>/api/v1/admin/mainnet/request-token \
  -H "X-Admin-Key: $ADMIN_KEY"
# 响应只有 8 字符 hint。完整 token 在 gateway stderr：
docker compose logs gateway 2>&1 | grep -A1 'EMAIL CONFIRMATION REQUIRED'

# 拷贝完整 token confirm
curl -X POST https://<your-domain>/api/v1/admin/mainnet/confirm \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"token": "<full-token-from-stderr>"}'
# 之后 1 小时窗口内 mainnet 下单可通
```

Polymarket 同理（`POLYMARKET_TRADING_ENABLED` + 同一 token store）。

### WS 订阅 `prediction_strategy` 返 `unknown topic kind`

应该在 commit 1557a08 已修。如果仍出现：

```bash
# 看 gateway 是否最新代码
docker compose -f infra/docker-compose.yml \
  -f infra/docker-compose.prod.yml \
  build --no-cache gateway
docker compose up -d gateway
```

如果重建还有，确认 hub switch 含 `prediction_strategy` 分支
（`gateway/internal/ws/hub.go`）。

### `/healthz` `deps` 一直 disabled / 不显示

**原因**：gateway 配置解析没拿到 redis / timescale / quant 端点。

**修法**：

```bash
docker compose exec gateway env | grep -E '(REDIS_URL|TIMESCALE_DSN|QUANT_GRPC_ADDR)'
# 必须全部非空
```

如果空了 → `.env` 里这些 key 被注释或拼错。compose `env_file: ../.env`
读不到的话会沉默失败。

## 性能 / 数据库类

### 数据库迁移失败 / 索引重建慢

通常是 `backtest_results` 集合膨胀（一次重型回测可写 50k+ trade 记录）。
新加索引时 mongo 会阻塞写：

```bash
docker compose exec mongo mongosh finance --eval \
  "db.backtest_results.stats().size"
# 如果几十 GB，考虑离线 reIndex
```

**修法**：

1. 先 `/admin/halt` 暂停所有写
2. mongo shell 用 `db.collection.createIndex(..., {background: false})` 强制 foreground，更快但锁更久
3. 或者用 mongo 4.4+ 默认 background index，慢但不锁

### Mongo / Timescale 磁盘满

```bash
docker system df
docker volume ls
# fn_mongo_data / fn_timescale_data 卷大小
```

清 backtest 历史：

```javascript
// mongo shell
db.backtest_results.deleteMany({createdAt: {$lt: new Date(Date.now() - 30*24*3600*1000)}})
```

Timescale 上 OHLCV / equity_curve 是 hypertable，按时间分块自动 drop：

```sql
SELECT drop_chunks('ohlcv', INTERVAL '180 days');
```

## Docker / Compose 类

### `docker-compose.dev.yml` 源代码改动不生效

**原因**：dev override 把 `../gateway` 和 `../quant` bind-mount 到容器内
`/app/src`，但**镜像里 `/app/` 已经是 build 产物**，mount 只是覆盖
`/app/src` 子路径。改 Go / Python 代码后**不会自动**触发 binary 重建。

**修法**：

```bash
# Go：在宿主机直接 `go run`（推荐 dev 工作流）
cd gateway
go run ./cmd/gateway   # :3001 替代容器里那个

# Python：在宿主机直接 `uv run`
cd quant
uv run python -m quant.main

# 或者用 compose 重建 + 重启
docker compose -f infra/docker-compose.yml \
  -f infra/docker-compose.dev.yml \
  up -d --build gateway
```

bind-mount 是 `:ro`，只方便从容器内**看**源码，不为 hot reload 设计。

### `Cannot start service ...: driver failed programming external connectivity`

端口被占。

```bash
lsof -iTCP -sTCP:LISTEN | grep -E ':(3000|3001|8000|27017|6379|5432) '
```

杀掉占用进程，或在 compose override 改端口。

### 容器一启动就 exit 0

通常是 entrypoint 立即返回。最常见是 gateway/quant 启动时 env 校验失败：

```bash
docker compose logs gateway --tail 20
# 必有具体错误
```

如果没有输出 → 容器还没来得及打日志就 exit，检查 image build 是否完整。

## 最后兜底

如果以上都没命中：

```bash
# 全栈完整日志（最近 500 行）
docker compose \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.prod.yml \
  logs --tail 500 > /tmp/finance_next.log

# 把这个日志 + .env（去掉所有 KEY/SECRET/PASSWORD 行）发出来求救
grep -vE '(KEY|SECRET|PASSWORD|URI)=' .env > /tmp/finance_next.env.redacted
```

参考资料：

- `CLAUDE.md` §7（env 语义）、§8（安全契约）、§5（API 表）
- `.env.example`（每个变量的注释）
- `infra/scripts/check-env.sh`（预飞行规则）
- `01-quickstart.md` / `02-production.md`

# 生产部署（Production）

> 目标读者：准备把 finance_next 上 prod 的运维 / SRE。
> 假设你已经在本机走完 `01-quickstart.md`，对架构有基本了解。

## 前置

- 一台 Linux 服务器（推荐 2 vCPU / 4 GB RAM 起步；Mongo + Timescale 自托管
  时建议 8 GB+）
- Docker Engine 24+ 与 Docker Compose v2
- 一个域名 `<your-domain>` 并已把 A/AAAA 记录指向服务器（Caddy 自动签
  Let's Encrypt 证书时需要）
- 防火墙仅放行 80/443（Caddy）和 22（SSH）；其它端口（27017 / 6379 / 5432
  / 3001 / 8000）**不要**对外暴露
- 一个用来跑 backup 的外部对象存储（S3 兼容即可）

## 1. 准备 `.env`

```bash
git clone <repo-url> /opt/finance_next
cd /opt/finance_next
cp .env.example .env
```

`.env` 必填项（与 quickstart 相同）：

```bash
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env
echo "AUTH_JWT_SECRET=$(openssl rand -hex 32)" >> .env
```

接着按 prod 要求改这些：

| 变量 | prod 值 | 说明 |
| --- | --- | --- |
| `AUTH_COOKIE_SECURE` | `true` | HTTPS-only cookie。`docker-compose.prod.yml` 已强制注入，确认 `.env` 不冲突即可 |
| `ALLOWED_ORIGINS` | `https://<your-domain>` | 逗号分隔；**不要包含 `*`**，与 credentials cookie 互斥 |
| `AUTH_COOKIE_DOMAIN` | `.your-domain.com` 或留空 | 多子域共享 cookie 才填；单域留空 |
| `ALLOW_S2S_HEADER` | `false`（默认） | **不要开**。开了 `X-Admin-Key` 会绕过 cookie 鉴权，仅在 gateway 处于完全内网时考虑；详见 CLAUDE.md §8 |
| `REQUIRE_USER_ID` | `true`（默认） | 多租户 header 必填 |
| `ADMIN_KEY` | `$(openssl rand -hex 32)` | 非空 = `/api/v1/admin/*` 路由可达且需带 `X-Admin-Key`；空 = 全部 404 隐藏 |
| `MAINNET_TRADING_ENABLED` | 默认 `false` | 字面量 `true` 才允许 Binance USDM mainnet。仍需 admin 走 token 流程 |
| `POLYMARKET_TRADING_ENABLED` | 默认 `false` | 同上 Polymarket；和 Binance 共享同一 `TokenStore` |
| `RATELIMIT_BACKEND` | `redis` | 多副本部署**必须**改为 redis；默认 `memory` 在多副本下会 race |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://otel-collector:4318` 等 | 留空 = trace 走 stdout，不会外发 |
| `KEK_PROVIDER` | `env`（默认） | 切 KMS 见 §6 |
| `POLYGON_RPC_URL` | Alchemy/Infura 私节点 | 默认公共节点 rate-limited，prod 必换 |

> **改值后果备忘**（CLAUDE.md §7/§8）：
> - `ENCRYPTION_KEY` 改值 = 所有交易所 API key / Polygon 私钥 ciphertext 立即
>   不可解密，必须恢复旧值或走 KEK rotate 流程；**没有救赎路径，备份是唯一保底**。
> - `AUTH_JWT_SECRET` 改值 = 所有 cookie 立即失效，全员重登（是预期行为）。
> - `ADMIN_KEY` 改值 = 老 key 立即失效，运维端 / cron 调用 admin 端点的脚本要同步更新。

跑预飞行校验：

```bash
bash infra/scripts/check-env.sh
```

## 2. 启服务

```bash
export DOMAIN=<your-domain>

docker compose \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.prod.yml \
  up -d
```

prod override（`docker-compose.prod.yml`）相对 base 的差异：

- mongo / redis / timescale / gateway / quant 全部**移除 host port 映射**，
  只在 docker 内网可达
- `restart: always`（不是 `unless-stopped`），主机重启自动恢复
- gateway `AUTH_COOKIE_SECURE=true` 强制注入
- 新增 `caddy` 服务（caddy:2-alpine），暴露 80/443 + HTTP/3，自动 Let's Encrypt

等所有服务 healthy（首启 ~2 分钟，Caddy 签证书要 30–60 秒）：

```bash
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml ps
```

外网验证：

```bash
curl -sf https://<your-domain>/healthz | jq .
# Caddy 把 /healthz 反代到 gateway:3001/healthz

curl -s -o /dev/null -w "%{http_code}\n" https://<your-domain>/api/v1/auth/me
# 401 是预期（未登录）
```

## 3. 注册第一个 admin

**Bootstrap 硬约束**：第一个注册成功的 user 自动获得 admin 角色。
这个动作必须在公开任何注册链接前完成，否则后续注册的也是普通 user。

```bash
# 浏览器打开 https://<your-domain>/register
# 填邮箱 + 密码 → 注册 → 自动登录 → 已是 admin
```

确认：

```bash
curl -sf https://<your-domain>/api/v1/auth/me \
  -H "Cookie: <从浏览器 devtools 拷贝>" | jq .
# {"id":"...","email":"...","role":"admin",...}
```

> 注册完成后**强烈建议**在 dashboard `/admin` 关闭 self-register（如果有
> 开关）或在反代层用 basic auth 加锁。当前 codebase 默认允许 register，
> 你的反代是第一道防线。

## 4. 历史数据迁移（claim-legacy）

如果你是从早期版本（无 user_id 字段）升级而来，所有遗留的 strategy /
account / option 文档都没有 user_id。第一个 admin 可以一键 claim：

```bash
curl -X POST https://<your-domain>/api/v1/admin/claim-legacy \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -H "Cookie: <admin cookie>"
# {"claimed": {"options": N, "accounts": M, ...}}
```

约束：当前必须**只有一个 admin**才能调用（防止误 claim 别人的数据）。

## 5. Backup 演练

`infra/scripts/` 已经提供脚本，每晚跑一次就行。

### Mongo

```bash
# 本地落盘（无 S3）
MONGODB_URI=mongodb://localhost:27017/finance \
  bash infra/scripts/backup-mongo.sh
# → /backup/<UTC stamp>/finance/*.bson.gz

# 上 S3（推荐）
MONGODB_URI=mongodb://localhost:27017/finance \
  BUCKET=s3://my-backups/finance \
  bash infra/scripts/backup-mongo.sh
# 自动 aws s3 sync 后清本地副本
```

### Timescale

```bash
TIMESCALE_DSN=postgres://app:app@localhost:5432/finance \
  BUCKET=s3://my-backups/finance \
  bash infra/scripts/backup-timescale.sh
# pg_dump custom format + gzip → S3
```

> Mongo dump 时上面用 `localhost`，前提是你**临时**把端口暴露出来。prod
> override 默认不暴露，建议在宿主机上跑（直接 `docker compose exec` 进
> mongo 容器，或者把 backup 脚本打到一个临时 sidecar 里）。

### Cron 建议

```cron
# /etc/cron.d/finance_next_backup
0 3 * * * root MONGODB_URI=... BUCKET=s3://... /opt/finance_next/infra/scripts/backup-mongo.sh >> /var/log/fn_backup.log 2>&1
30 3 * * * root TIMESCALE_DSN=... BUCKET=s3://... /opt/finance_next/infra/scripts/backup-timescale.sh >> /var/log/fn_backup.log 2>&1
```

### RPO / RTO

- **RPO**: 24 小时（每日全量；增量 oplog 备份未实装）
- **RTO**: Mongo 全量 restore ~5–15 分钟（依库大小）；Timescale ~10–30 分钟

如果业务对 RPO 要求 < 24h，需要额外配置 Mongo oplog tailing 或 PITR
（不在 4.F 范围）。

## 6. Kill switch 演练

`POST /api/v1/admin/halt` 是核心熔断：写入 `system_state.tradingHalted=true`，
order engine 在**任何**风控闸之前就拒绝所有 submit（CLAUDE.md §8 硬约束）。

```bash
# 暂停所有下单
curl -X POST https://<your-domain>/api/v1/admin/halt \
  -H "X-Admin-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"reason": "incident-2026-05-12"}'

# 确认状态（dashboard 红条 banner 也会出现）
curl -sf https://<your-domain>/api/v1/admin/system-state \
  -H "X-Admin-Key: $ADMIN_KEY" | jq .
# {"tradingHalted": true, "reason": "incident-2026-05-12", ...}

# 恢复
curl -X POST https://<your-domain>/api/v1/admin/resume \
  -H "X-Admin-Key: $ADMIN_KEY"
```

建议：演练一次，确认所有 strategy 的 order 都被 `event.order.rejected`
拒，然后 resume。**演练时间不要超过几秒**，否则 reconcile loop 会标记
strategy 状态异常。

## 7. 升级流程

```bash
cd /opt/finance_next
git pull origin main

# 重新 build + 滚动重启（compose 内置的"先停旧再起新"有 ~5–10s 中断窗口）
docker compose \
  -f infra/docker-compose.yml \
  -f infra/docker-compose.prod.yml \
  up -d --build
```

要点：

- compose 的 "zero-downtime" 是有限的：单容器停-起之间存在窗口。对要求严
  格的场景请走 k8s（`infra/k8s/` 有 Deployment manifest，但 secret 是
  占位 example，不能直接生产用）。
- gateway 重启会清掉 `RATELIMIT_BACKEND=memory` 的 in-memory rate-limit
  计数。**这就是为什么 prod 必须用 `redis` backend**。
- 升级前先 `/admin/halt`，升级后跑一遍 health check 再 `/admin/resume`。
- 改了 `.env` 也要重启容器（compose 不会自动 reload env_file）。

### KEK rotate（KMS 切换）

详见 CLAUDE.md §8 完整流程。简版：

1. 设 `KEK_PROVIDER=aws-kms` + `AWS_KMS_KEY_ID` + `AWS_REGION`
2. 在 `gateway/internal/crypto/kek.go` 把 stub `AWSKMSKEKProvider`
   替换为真实 AWS SDK 调用（注释里有完整 call shape）
3. 滚动重启 — 老 DEK ciphertext 仍由 env KEK 解密直到 admin rotate 工具
   搬到新 KEK；新写的 DEK 走新 provider
4. `EnvelopeService` 接收 `KEKProvider` 接口，不动调用方代码

## 8. 监控接入

### Prometheus

`/metrics` 端点（gateway 和 quant 都有）暴露进程内计数器 / 直方图。
Caddyfile 已经把 `/metrics` 限制为 RFC1918 私网 IP：

```
@private_nets {
    remote_ip 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 127.0.0.1/32
}
```

如果你的 Prometheus 在不同网段，编辑 `infra/caddy/Caddyfile` 加进去再
`docker compose restart caddy`。

scrape 配置示例：

```yaml
- job_name: finance_next_gateway
  metrics_path: /metrics
  static_configs:
    - targets: ['<gateway-internal-ip>:3001']
- job_name: finance_next_quant
  metrics_path: /metrics
  static_configs:
    - targets: ['<quant-internal-ip>:8000']
```

Grafana dashboard JSON 已检入 `infra/grafana/dashboards/{gateway,quant}.json`，
Grafana → Import 直接喂。

### Load balancer 健康检查

- gateway: `GET /healthz`（liveness，始终 200 if 进程在）
- gateway: `GET /readyz`（readiness，deps 全部连通才 200）
- quant: `GET /readyz`（timescale + redis 都 ping 通才 200）

## 9. 安全 hardening checklist

部署完跑一遍：

- [ ] `.env` 没有 commit 到 git（`.gitignore` 已 cover，但 double check）
- [ ] `ENCRYPTION_KEY` / `AUTH_JWT_SECRET` 已备份到密码管理器
      （丢了 = 加密数据无法恢复）
- [ ] `ADMIN_KEY` 已生成 + 备份；未在 chat / 邮件里明文传过
- [ ] Mongo 默认用户名密码已改（compose 默认 mongo 无密码 — prod 强烈建议
      在 compose 里加 `MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD`
      或挂个 keyfile）
- [ ] Timescale `app/app` 默认凭证已改（编辑 docker-compose 的 `POSTGRES_PASSWORD`
      + 同步 `TIMESCALE_DSN`）
- [ ] 防火墙仅开放 80/443/22
- [ ] `docker network inspect` 确认 mongo/redis/timescale 没有 published ports
- [ ] Caddy 自动续证已工作（`docker compose logs caddy | grep 'certificate'`）
- [ ] `/api/v1/admin/*` 在未带 `X-Admin-Key` 时返回 401/404
- [ ] `ALLOW_S2S_HEADER=false` 维持
- [ ] **Polymarket 三道闸**：`MAINNET_TRADING_ENABLED` /
      `POLYMARKET_TRADING_ENABLED` 默认 `false`；要开通先准备好 admin token
      流程（`/admin/mainnet/request-token` → `/admin/mainnet/confirm`，
      完整 token 仅打印到 gateway stderr 日志，关键字
      `EMAIL CONFIRMATION REQUIRED`）
- [ ] Backup 脚本已 cron + 至少跑过一次手动 restore 演练
- [ ] `/admin/halt` 演练已做
- [ ] Audit 日志 TTL `AUDIT_RETENTION_DAYS` 已设到合规要求（默认 2557 天 = 7 年）

## 10. 出问题怎么办

按这个顺序排查：

1. `curl https://<your-domain>/healthz` — gateway 活着吗
2. `docker compose logs --tail 200 gateway` — 错误堆栈
3. `docker compose ps` — 哪些服务挂了
4. `bash infra/scripts/check-env.sh` — env 漂移了吗
5. 翻 [`03-troubleshooting.md`](./03-troubleshooting.md)

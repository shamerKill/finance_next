# 使用文档

面向操作者的日常使用指南。如果你是第一次跑这个项目，先读 [README.md](./README.md) 快速启动；技术细节请翻 [CLAUDE.md](./CLAUDE.md)。

---

## 目录

1. [一次性配置](#一次性配置)
2. [日常操作流](#日常操作流)
3. [监控运维](#监控运维)
4. [AI 模型切换](#ai-模型切换)
5. [常见错误诊断](#常见错误诊断)
6. [测试 / 开发循环](#测试--开发循环)
7. [已知限制](#已知限制)

---

## 一次性配置

### 1. 生成 ADMIN_KEY

`/api/v1/admin/*`、`/api/v1/market/ingest`、钱包 approve、策略 submit-order 等都需要管理员鉴权。Gateway 通过环境变量 `ADMIN_KEY` 配置；**为空时整组端点返回 404**（藏起来）。

```bash
ADMIN_KEY=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
# 写到 gateway/.env：
echo "ADMIN_KEY=$ADMIN_KEY" >> gateway/.env
# 重启 gateway 生效
```

然后在浏览器进 **`/admin`**，把同样的 key 粘进"管理密钥"输入框点保存。右侧会显示 **✓ 已验证** 或 **✗ 密钥错误**。

> 💡 Key 只存浏览器 localStorage，仅通过 `X-Admin-Key` header 发到 gateway。

### 2. 配置 AI（可选）

不配 AI key 时优化器走默认搜索空间 + 确定性 fallback rationale。要让 Claude / GPT 真的参与策略调优：

编辑 `quant/.env`：

```bash
# 二选一：

# 用 Claude（默认）
export ANTHROPIC_API_KEY=sk-ant-...
export ANTHROPIC_BASE_URL=https://api.anthropic.com    # 或代理地址

# 用 GPT-5.5（OpenAI Responses API）
export AI_MODEL_FAMILY=openai
export OPENAI_API_KEY=sk-...
export OPENAI_BASE_URL=https://api.openai.com          # 或代理地址
```

预算闸默认 `AI_MAX_USD_PER_STUDY=$5` / `AI_MAX_USD_PER_DAY=$50`，超额自动退化到 fallback。

重启 quant worker 后生效。

### 3. 用户 ID（多租户预留）

`X-User-Id` header 标识请求归属的用户。未设 = 默认值 `default`，单租户开发模式。需要测试多用户时进 `/admin` 设"用户 ID"输入框。

未来真正的认证 provider（Auth0 / Clerk / Cognito）会在边缘验证后注入此 header。

---

## 日常操作流

下面是从空数据库到看到 AI 推荐的最短路径，每一步给出 UI 操作 + curl 等价命令。

### Step 1 — 抓取行情数据

**UI**：`/markets`（或 `/prediction/markets`、`/data-explorer/*`）右上角 **"立即抓取数据"** 按钮。需要先在 `/admin` 配好 admin key。

**curl**：

```bash
curl -X POST http://localhost:3001/api/v1/market/ingest \
  -H "X-Admin-Key: $ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{
    "exchange":"binance",
    "symbol":"BTCUSDT",
    "timeframe":"1h",
    "start":"2026-04-11T00:00:00Z",
    "end":"2026-05-11T00:00:00Z"
  }'
# → 200 {"runId":"...","barsIngested":720,"fromTs":"...","toTs":"..."}
```

`exchange` 可选 `binance` / `okx` / `bybit`；`timeframe` 支持 `1m / 5m / 1h / 1d`。

抓完进 `/markets` 看 K 线图。

### Step 2 — 添加交易所账户（可选，仅 live 需要）

**UI**：侧栏 **账户 → + 添加账户**。

- **Binance / Bybit**：需要 API key + secret。**带提现权限的 key 会被拒**（gateway 调 `/sapi/v1/account/apiRestrictions` 检查）。
- **OKX**：额外需要 passphrase。

提交后 gateway 会先 probe 一次权限，凭据被 AES-256-GCM 信封加密入库。响应不返回密文，审计日志会自动 scrub 任何含 `apiKey` / `secret` / `passphrase` 的字段。

### Step 3 — 创建策略

**UI**：侧栏 **新建策略**（`/option`）。11 个字段全填：

| 字段 | 含义 |
|---|---|
| 名称 | 3-8 字符，唯一 |
| 杠杆倍数 | 1-125 |
| 未开仓停止时间 | 分钟 |
| 交易对 | 例如 `BTCUSDT` |
| 订单组保证金 | USD |
| 止盈率 / 止损率 | 0..1 |
| 补仓后止盈降低率 | 0..1 |
| 止盈后保本单 | switch |
| 分批开仓 | 一组 `{marginRate, lossAddRate}`，可加行 |
| 邮箱 / API 密钥 / Secret 密钥 | 实盘下单用 |

成功后跳回 `/strategies`。

### Step 4 — 跑回测（可选）

**UI**：`/backtests/new`。选 strategy + 时间窗口，启动。WS 实时回传进度（5% 节流），完成后看 equity 曲线 + trade 表。

### Step 5 — 触发 AI 优化

**UI**：进策略详情页 `/strategies/<id>` → 右上 **"立即调优"** 按钮。

**curl**：

```bash
curl -X POST http://localhost:3001/api/v1/strategies/$STRATEGY_ID/optimize \
  -H "X-User-Id: default" -H "Content-Type: application/json" -d '{}'
# → 202 {"studyId":"...","enqueuedAt":"..."}
```

后台执行：Optuna TPE 跑 200 次 trials（在前 70% 数据做 IS，后 30% OOS）→ Claude/GPT 在三个边界打分（define_search_space / refine_search_space / final_rationale）→ 写入 `ai_recommendations` 集合，状态 `pending_review`。

实时进度可在 WS topic `optimization:<studyId>` 订阅，或轮询 `GET /api/v1/optimizations/<studyId>`。

典型 study 30-60 秒，成本 < $0.05（Claude）。

### Step 6 — 审批 AI 推荐

**UI**：侧栏 **AI 推荐**（`/recommendations`）→ 点 **审核 →** 进详情。

详情页显示：
- 参数 diff 表格（当前值 vs 建议值）
- Δ 夏普 / Δ 收益
- AI 长文 rationale（含风险归因、样本量警告）
- IS / OOS 指标 + 最大回撤 + 交易数
- **批准** / **拒绝** 按钮

**批准的事务**：原子地（Mongo session+tx）写入新策略参数 + `currentVersion += 1` + 把同 strategy 其它 pending 推荐标记 `superseded` + emit `event.strategy.upserted` 到 Redis Stream。

> ⚠️ **永远没有 auto-apply 路径**。AI 输出必须人工显式批准，硬约束。

### Step 7 — 开 mainnet 实盘（高危）

需要 **三道闸全部满足**：

1. 策略 `live.mode == "mainnet"`（UI 上策略详情页"实盘模式"切换）
2. env `MAINNET_TRADING_ENABLED=true`（Polymarket 是 `POLYMARKET_TRADING_ENABLED`）
3. admin 走完 `POST /admin/mainnet/request-token` → 邮件 / stderr 取回完整 token → `POST /admin/mainnet/confirm` 在 1 小时窗口内确认

任一缺失，订单引擎在风控闸最后一步 `MainnetGate.Allowed()` 返 `ErrMainnetGateDenied` 拒单。

完整安全契约见 CLAUDE.md §8。

---

## 监控运维

### 查看账户余额 / 持仓

`/accounts/<id>` 显示：

- **余额**：现货可用 + 冻结 + 钱包类型，按非零资产过滤。零余额账户显示 "账户连接成功，当前无非零余额"（区别于失败的"暂无数据"）。
- **持仓**：USDM 期货 `positionAmt ≠ 0` 的合约。
- **实时事件**：通过 WS 推送的订单填充 / 余额更新。

右上 **↻ 刷新** 按钮触发服务端重拉（不动 WS 连接）。

> ⚠️ **Binance spot 用户数据流接口 2024 年下线**（`/api/v3/userDataStream` 返 410 Gone）。当前 spot 实时流降级为黄色 banner 提示。订单事件不受影响（走 Redis Stream，不依赖 Binance WS）。

### 投资组合视图

`/portfolio` 跨交易所聚合：

- 总计 USD（用 Timescale 最近 close 估值，缺失行情按 0 计）
- 按交易所拆分
- 主要资产 top 10

### 紧急停机（Kill Switch）

`/admin` → "紧急停机开关" → 填原因 → **暂停所有交易**。

订单引擎在风控闸**最前面**读这个标志，halted 时所有 submit 直接拒。也覆盖 Polymarket 预测订单。

恢复：点 **恢复** 按钮，立即清旗。

### 投资组合限额

`/admin` → "投资组合限额" 设三个上限：

- 最大未平仓名义金额（USD）
- 最大持仓数量
- 每日最大亏损（USD）

0 表示不限。引擎在 per-strategy 风控闸之后做跨策略检查。

### 审计日志

`/admin/audit` 查所有非 GET 请求，含：
- 操作者 / 资源类型 / 资源 ID
- 请求体（敏感字段被 `[redacted]`：`apiKey` / `secret*` / `*passphrase*` / `*Ciphertext` / `privateKey` / `mnemonic` / `seed` / `token` 等）
- 响应状态
- IP / UA

TTL 默认 7 年（合规需求），Mongo TTL monitor 自动 prune。

### Prometheus 指标 / Grafana

`/metrics` 端点暴露 HTTP 直方图、订单引擎计数、AI 优化耗时等。Grafana 看板 JSON 在 `infra/grafana/dashboards/`。

OTel trace 默认 stdout（避免意外外发），设 `OTEL_EXPORTER_OTLP_ENDPOINT` 切到真后端。

---

## AI 模型切换

环境变量 `AI_MODEL_FAMILY` 控制：

| 值 | 客户端 | 默认主模型 | 默认 refine 模型 |
|---|---|---|---|
| `claude` 或未设 | `ClaudeClient` → Anthropic SDK → `/v1/messages` | `claude-sonnet-4-6` | `claude-haiku-4-5-20251001` |
| `openai` / `gpt` | `GPTClient` → OpenAI SDK → `/v1/responses` (stream) | `gpt-5.5` | `gpt-5.4` |

模型也可单独覆盖：

```bash
# Claude path
export ANTHROPIC_PRIMARY_MODEL=claude-opus-4-7      # 仅在 client 也支持时
# OpenAI path
export OPENAI_PRIMARY_MODEL=gpt-5.5
export OPENAI_REFINE_MODEL=gpt-5.4
```

API key 优先级：`OPENAI_API_KEY` → 回退 `ANTHROPIC_API_KEY`（同一代理常用同一 key）。

**切换零代码改动** — 改 env，重启 quant worker，下次 `/optimize` 就走新路径。所有 cost ledger 记录的 model 字段都跟随切换，审计追溯精确。

---

## 常见错误诊断

### "无权访问 — 管理员密钥缺失或不正确。"

| 原因 | 处理 |
|---|---|
| localStorage 里没存 key | 进 `/admin` 粘 key 保存 |
| 存的 key 跟 gateway env 不一致 | 同上，更新 |
| gateway 重启后换了 `ADMIN_KEY` | 同上 |
| `ADMIN_KEY` 在 env 里为空 → 整组端点 404 | 检查 `grep "^ADMIN_KEY=" gateway/.env`，确认非空 |

UI 错误条带"前往设置 →"链接可直接跳 `/admin`。

### "API 密钥包含提现权限 — 出于安全考虑不允许添加。"

Binance API key 在交易所后台勾选了 `Enable Withdrawals`。处理：

1. 登录 Binance → API Management
2. 编辑此 key → 取消"Enable Withdrawals"
3. 重新提交 / 创建账户

> 💡 我们调的是 `/sapi/v1/account/apiRestrictions`（**API key 层级**的权限），不是 `/api/v3/account.canWithdraw`（**账户层级**的能力，几乎所有账户都是 true）。

### "凭据校验失败：&lt;APIError&gt; code=-2008 / -2014 / -2015 / -1022 / -1021"

| 代码 | 含义 | 处理 |
|---|---|---|
| `-2008` | API key 不存在或已撤销 | 重新生成 |
| `-2014` | API key 格式无效 | 检查粘贴是否完整 |
| `-2015` | IP 白名单 / 权限不足 | 把本机 IP 加进白名单，或新建无 IP 限制的 key |
| `-1022` | Secret 错（签名失败） | 重新粘 secret |
| `-1021` | 本机时钟偏差过大 | 校准系统时间（NTP） |

详见 `gateway/internal/http/handlers/account.go::translateProbeError`。

### "Binance 已下线 spot 用户数据流接口"

`/accounts/<id>` 顶部黄色 banner。**不是 bug**，是 Binance 2024 年 retire 了 `/api/v3/userDataStream`。订单事件走 Redis Stream 不受影响；只是 spot 余额变化不再实时推送。

未来切到 Binance WebSocket API method `userDataStream.start`（`wss://ws-api.binance.com:443/ws-api/v3`）恢复。

### 优化跑完但 cost = 0、rationale 是 fallback

可能原因：
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` 未配置 → 走 fallback 路径
- 代理 401（key 失效 / quota 用完）→ `quant/.log` 会看到 `401 invalid x-api-key`
- 预算耗尽 → `optimization_runs.state == "budget_exceeded"`

检查 quant worker log：

```bash
grep -i "claude\|openai\|fallback\|budget" /tmp/fnlogs/quant.log | tail -10
```

### 行情 ingest 502 / RequestTimeout

ccxt 内部 aiohttp 直连 Binance 被墙 / 路由慢。两种处理：

1. 本机起 V2Ray / Clash 代理，shell 设：
   ```bash
   export HTTPS_PROXY=http://127.0.0.1:10808
   ```
   重启 quant worker。ccxt 会读 `HTTPS_PROXY` env 透传给 SDK。
2. 或者把 quant 部署在能直连 Binance 的机器 / 容器。

### MongoDB `error decoding key _id`

修过了（commit `d9a760f` + `ffae4ed`），不应该再出现。如再次出现说明有新加的 repo 没沿用 `delete(m, "_id")` 模式。所有 decoder 应该在 `bson.Unmarshal` 前剥掉 `_id`，事后从 `bson.ObjectID` hex 回填。

---

## 测试 / 开发循环

```bash
# Gateway
cd gateway
go test ./...               # 全单测，纯 offline
go vet ./...

# Quant
cd quant
uv run pytest -q            # 默认跑（138 passed, 4 skipped, 1 deselected）
uv run pytest -m integration tests/test_e2e_pipeline.py
                            # e2e 跑完整流水线，需要 gateway 在线
uv run ruff check .

# Client
cd client
yarn lint
yarn tsc --noEmit           # 或 yarn typecheck
yarn build
yarn check                  # lint + typecheck 一起跑
```

E2E 测试 (`tests/test_e2e_pipeline.py`) 用 `@pytest.mark.integration` 标记，默认 pytest 跑会 deselect；gateway 离线时 fixture 自动 skip，不阻塞。

CI 跑全部：`pytest -q && pytest -m integration`。

---

## 已知限制

完整列表在 [CLAUDE.md §9](./CLAUDE.md#9-当前进度--todo)。摘要：

- **多租户认证还没真接 auth provider** — 现在 `X-User-Id` 是 trust-the-frontend；future Auth0/Clerk 集成在 phase 10。
- **Polymarket 自动交易未挂 runtime** — `polymarket_event` 策略类存在但 quant runtime 没注册，目前只能 admin 手动 `submit-order`。
- **AWS / GCP KMS 是 stub** — `KEK_PROVIDER=aws-kms` / `gcp-kms` 当前返 `ErrKEKNotConfigured`，要切真 KMS 需在 `gateway/internal/crypto/kek.go` 替换 SDK 调用。
- **Binance spot user-stream 降级** — 见上文。
- **GPT-5.5 / GPT-5.4 价格未填** — `gpt_client.py` 里写 0，预算闸照常工作但成本数字不准；真价格出来后填 `_PRICE_PER_M_*` 即可。

---

## 进一步阅读

- [README.md](./README.md) — 5 分钟启动
- [CLAUDE.md](./CLAUDE.md) — 完整架构、数据模型、API 表、各 phase 历史、安全契约
- `infra/grafana/dashboards/*.json` — Grafana 看板模板
- `infra/k8s/` — k8s 部署 manifest（占位 secret，需替换）

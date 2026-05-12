#!/usr/bin/env bash
#
# check-env.sh — 校验 .env 文件，stack 启动前预飞行检查
#
# 用法：
#   bash infra/scripts/check-env.sh             # 默认校验 ./.env
#   bash infra/scripts/check-env.sh path/to/env # 指定文件
#
# 退出码：
#   0 = 通过（可能含警告）
#   1 = 必填缺失 / 格式错误（致命）
#
# 兼容 bash 3.2（macOS 默认）— 不使用 ${VAR,,} / associative arrays。

set -euo pipefail

ENV_FILE="${1:-.env}"

if [ ! -f "$ENV_FILE" ]; then
    echo "X $ENV_FILE 不存在 — 先 cp .env.example $ENV_FILE 后填入值"
    exit 1
fi

# Load env file. `set -a` 自动 export，让后续脚本可读。
# shellcheck disable=SC1090
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

MISSING=()
INVALID=()
WARNINGS=()

# check_required <KEY>
check_required() {
    local key="$1"
    local val="${!key:-}"
    if [ -z "$val" ]; then
        MISSING+=("$key")
    fi
}

# check_hex <KEY> <expected_length_chars>
check_hex() {
    local key="$1"
    local len_required="$2"
    local val="${!key:-}"
    if [ -z "$val" ]; then
        return 0
    fi
    if ! [[ "$val" =~ ^[0-9a-fA-F]+$ ]]; then
        INVALID+=("$key: 必须是 hex string（仅 0-9a-fA-F）")
        return 0
    fi
    local actual_len="${#val}"
    if [ "$actual_len" -ne "$len_required" ]; then
        INVALID+=("$key: 长度 $actual_len，需要 $len_required hex chars ($((len_required / 2)) bytes)")
    fi
}

# ---- required ----
for k in MONGODB_URI ENCRYPTION_KEY AUTH_JWT_SECRET REDIS_URL; do
    check_required "$k"
done

# ---- format ----
check_hex ENCRYPTION_KEY 64
check_hex AUTH_JWT_SECRET 64

# ---- warnings (non-fatal) ----
if [ "${AUTH_COOKIE_SECURE:-true}" = "false" ]; then
    WARNINGS+=("AUTH_COOKIE_SECURE=false — 仅 dev http 可用，prod 必须 true")
fi
if [ "${ALLOW_S2S_HEADER:-false}" = "true" ]; then
    WARNINGS+=("ALLOW_S2S_HEADER=true — 确认 gateway 不直连公网，并且 ADMIN_KEY 非空")
    if [ -z "${ADMIN_KEY:-}" ]; then
        INVALID+=("ALLOW_S2S_HEADER=true 但 ADMIN_KEY 为空 — bypass 永远不会触发，配置自相矛盾")
    fi
fi
if [[ "${ALLOWED_ORIGINS:-}" == *"*"* ]]; then
    WARNINGS+=("ALLOWED_ORIGINS 含 '*' — 与 AllowCredentials=true 互斥，浏览器会丢 cookie")
fi
if [[ "${ALLOWED_ORIGINS:-}" == *"localhost"* ]] && [ "${AUTH_COOKIE_SECURE:-true}" = "true" ]; then
    WARNINGS+=("ALLOWED_ORIGINS 含 localhost 但 AUTH_COOKIE_SECURE=true — 可能误配（http localhost 无法收到 Secure cookie）")
fi
if [ "${MAINNET_TRADING_ENABLED:-false}" = "true" ]; then
    WARNINGS+=("MAINNET_TRADING_ENABLED=true — Binance 真实账户下单已 ARMED，确认 admin token 流程已就绪")
fi
if [ "${POLYMARKET_TRADING_ENABLED:-false}" = "true" ]; then
    WARNINGS+=("POLYMARKET_TRADING_ENABLED=true — Polymarket 实盘已 ARMED，确认 admin token 流程已就绪")
fi
if [ "${KEK_PROVIDER:-env}" != "env" ] && [ "${KEK_PROVIDER:-env}" != "aws-kms" ] && [ "${KEK_PROVIDER:-env}" != "gcp-kms" ]; then
    INVALID+=("KEK_PROVIDER=${KEK_PROVIDER} — 只接受 env / aws-kms / gcp-kms")
fi

# ---- report ----
if [ "${#MISSING[@]}" -gt 0 ]; then
    echo "X 缺失必填变量:"
    for k in "${MISSING[@]}"; do echo "  - $k"; done
fi
if [ "${#INVALID[@]}" -gt 0 ]; then
    echo "X 格式错误:"
    for v in "${INVALID[@]}"; do echo "  - $v"; done
fi
if [ "${#WARNINGS[@]}" -gt 0 ]; then
    echo "! 警告（非致命）:"
    for w in "${WARNINGS[@]}"; do echo "  - $w"; done
fi

if [ "${#MISSING[@]}" -gt 0 ] || [ "${#INVALID[@]}" -gt 0 ]; then
    exit 1
fi

echo "OK $ENV_FILE 校验通过"
exit 0

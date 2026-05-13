# finance_next dev orchestrator
#
# 常用：
#   make dev          一键起全栈（docker infra + gateway + quant + client 进 tmux）
#   make attach       进 tmux 看 log（cmd+B 然后 0/1/2 切窗，cmd+B 然后 d 分离）
#   make stop         停掉本地三进程（infra 容器保留）
#   make stop-all     停掉一切（含 docker 容器）
#   make status       看各端口占用
#
# 单起：
#   make infra-up     仅起 docker (mongo/redis/timescale)
#   make gateway      仅起 gateway（前台）
#   make quant        仅起 quant（前台）
#   make client       仅起 client（前台）
#
# 首次使用：
#   make install-tmux 先装 tmux（如未安装）

SHELL    := /bin/bash
ROOT     := $(shell pwd)
SESSION  := fn

.PHONY: dev attach stop stop-all status infra-up infra-down gateway quant client install-tmux build test help

help:
	@awk 'BEGIN{FS=":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ---- 一键起 ----
dev: infra-up _tmux-check ## 起 docker infra + gateway/quant/client 进 tmux
	@tmux has-session -t $(SESSION) 2>/dev/null && (echo "× session '$(SESSION)' 已存在 — 先运行 make stop"; exit 1) || true
	@tmux new-session  -d -s $(SESSION) -n gateway -c $(ROOT)/gateway   "go run ./cmd/gateway 2>&1 | tee /tmp/fn-gateway.log; echo; read -p '回车关闭此窗口'"
	@tmux new-window      -t $(SESSION) -n quant   -c $(ROOT)/quant     "uv run python -m quant.main 2>&1 | tee /tmp/fn-quant.log; echo; read -p '回车关闭此窗口'"
	@tmux new-window      -t $(SESSION) -n client  -c $(ROOT)/client    "yarn dev 2>&1 | tee /tmp/fn-client.log; echo; read -p '回车关闭此窗口'"
	@echo "✓ 已起：gateway / quant / client；log 也写到 /tmp/fn-*.log"
	@echo "  → make attach  进 tmux 看实时输出"
	@echo "  → make stop    一键收工"

attach: ## 进 tmux 看 log
	@tmux attach -t $(SESSION) || (echo "× 没有 tmux session；先 make dev"; exit 1)

stop: ## 停 tmux 三进程（infra 容器保留）
	@tmux kill-session -t $(SESSION) 2>/dev/null && echo "✓ tmux session 已关" || echo "  no tmux session"
	@pkill -f "go run ./cmd/gateway"  2>/dev/null || true
	@pkill -f "exe/gateway"           2>/dev/null || true
	@pkill -f "quant.main"            2>/dev/null || true
	@pkill -f "next-server"           2>/dev/null || true

stop-all: stop infra-down ## 停一切（含 docker 容器）
	@echo "✓ 全部停止"

status: ## 看各端口占用
	@for p in 3000 3001 8000 50051 27017 6379 5432; do \
		pid=$$(lsof -nP -iTCP:$$p -sTCP:LISTEN 2>/dev/null | awk 'NR==2{print $$2"|"$$1}'); \
		if [ -z "$$pid" ]; then printf "  %-6s 空闲\n" "$$p"; \
		else printf "  %-6s pid=%s\n" "$$p" "$$pid"; fi; \
	done

# ---- 单起 ----
infra-up: _env-check ## 起 docker (mongo/redis/timescale)
	@docker compose --env-file $(ROOT)/.env -f $(ROOT)/infra/docker-compose.yml up -d mongo redis timescale
	@echo "✓ docker infra ready"

infra-down: ## 停 docker
	@docker compose --env-file $(ROOT)/.env -f $(ROOT)/infra/docker-compose.yml stop mongo redis timescale 2>&1 | tail -3

_env-check:
	@test -e $(ROOT)/.env || (echo "× 仓库根缺 .env。运行：ln -s gateway/.env .env  或 cp .env.example .env 并填值"; exit 1)

gateway: ## 前台跑 gateway
	@cd $(ROOT)/gateway && go run ./cmd/gateway

quant: ## 前台跑 quant
	@cd $(ROOT)/quant && uv run python -m quant.main

client: ## 前台跑 client
	@cd $(ROOT)/client && yarn dev

# ---- 工具 ----
install-tmux: ## brew install tmux
	@brew install tmux

build: ## 编译三端，不起服务
	@cd $(ROOT)/gateway && go build ./cmd/gateway && echo "✓ gateway build OK"
	@cd $(ROOT)/client  && yarn build > /dev/null && echo "✓ client build OK"
	@echo "  quant 用 uv，无需独立 build"

test: ## 跑所有测试
	@cd $(ROOT)/gateway && go test ./...
	@cd $(ROOT)/client  && yarn lint

_tmux-check:
	@command -v tmux >/dev/null || (echo "× tmux 未安装。运行：make install-tmux"; exit 1)

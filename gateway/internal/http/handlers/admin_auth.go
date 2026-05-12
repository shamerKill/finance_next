// admin_auth.go — 收口 admin 双 key 模式。
//
// 历史上，所有 /api/v1/admin/* 端点都通过 `X-Admin-Key` header 鉴权，
// 并在 `ADMIN_KEY` env 未设置时以 404 隐藏端点。Phase 1.A.1 引入了 JWT
// cookie + role-based auth 后，仍然要求 UI 维护一个独立的 admin key 输
// 入框非常笨重 —— cookie 里的 `role=admin` 才是这台机器上的真实权限源。
//
// `IsAdminRequest` 把这两条路径折叠成一个调用点：
//
//   - 主路径：WithAuth 解出来的 `role=admin`（来自 JWT cookie 的 sub）。
//     这是 UI 始终走的路径。
//   - 兼容路径：`X-Admin-Key: <key>` 跟 handler 注入的 adminKey 常时比较。
//     仅当 adminKey != "" 时启用。这条路径继续支持 s2s / CI / curl 场景
//     （middleware/auth.go 里的 ALLOW_S2S_HEADER 也走同一个 header）。
//
// 任一路径通过即放行。两条路径都不通过 → 调用方应当回 403/404 由调用
// 端决定（CLAUDE.md 之前的 "ADMIN_KEY 未配置则 /admin/* 整组 404" 契约
// 被本次改动有意打破：cookie path 一旦工作，admin 用户应当总是能访问
// admin 端点，与是否配置了静态 key 无关）。
package handlers

import (
	"crypto/subtle"

	"github.com/finance_next/gateway/internal/domain"
	gwmw "github.com/finance_next/gateway/internal/http/middleware"
	"github.com/labstack/echo/v4"
)

// IsAdminRequest reports whether the request comes from an admin caller.
//
// 优先看 Echo context 里的 `userRole`（WithAuth 从 JWT cookie 写入），
// 然后回退到 `X-Admin-Key` header（常时比较）。adminKey 为空时直接禁用
// header path —— 我们绝不让一个空字符串 == 一个空 header 来意外放行。
func IsAdminRequest(c echo.Context, adminKey string) bool {
	if role, ok := c.Get(gwmw.ContextRoleKey).(string); ok && role == domain.UserRoleAdmin {
		return true
	}
	if adminKey == "" {
		return false
	}
	provided := c.Request().Header.Get("X-Admin-Key")
	if provided == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(provided), []byte(adminKey)) == 1
}

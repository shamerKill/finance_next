package handlers

import (
	"errors"
	"strings"
	"testing"
)

func TestTranslateProbeError(t *testing.T) {
	cases := []struct {
		name        string
		err         error
		wantContain string
		wantPrefix  string // optional: when error falls through
	}{
		{
			name:        "binance -2008 invalid api-key id",
			err:         errors.New("binance: probe permissions: <APIError> code=-2008, msg=Invalid Api-Key ID."),
			wantContain: "API 密钥不存在或已被删除",
		},
		{
			name:        "binance -2014 format invalid",
			err:         errors.New("binance: <APIError> code=-2014, msg=API-key format invalid."),
			wantContain: "API 密钥格式无效",
		},
		{
			name:        "binance -2015 ip whitelist",
			err:         errors.New("<APIError> code=-2015, msg=Invalid API-key, IP, or permissions for action."),
			wantContain: "IP 白名单",
		},
		{
			name:        "binance -1022 bad signature",
			err:         errors.New("<APIError> code=-1022, msg=Signature for this request is not valid."),
			wantContain: "Secret 密钥不正确",
		},
		{
			name:        "binance -1021 clock skew",
			err:         errors.New("<APIError> code=-1021, msg=Timestamp for this request is outside of the recvWindow."),
			wantContain: "本机时钟",
		},
		{
			name:        "service unavailable",
			err:         errors.New("Service unavailable"),
			wantContain: "暂时无法访问",
		},
		{
			name:       "unknown error falls through with prefix",
			err:        errors.New("some upstream gibberish 42"),
			wantPrefix: "凭据校验失败：",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := translateProbeError(tc.err)
			if tc.wantContain != "" && !strings.Contains(got, tc.wantContain) {
				t.Errorf("got %q, want to contain %q", got, tc.wantContain)
			}
			if tc.wantPrefix != "" && !strings.HasPrefix(got, tc.wantPrefix) {
				t.Errorf("got %q, want prefix %q", got, tc.wantPrefix)
			}
		})
	}
}

"use client";

// Edit modal for the /admin/ai page. Wraps a HeroUI <Modal> with form
// fields for every editable knob on TypeAIConfig. The submit handler
// validates inline (per-day >= per-study, lookback 7..365) before
// hitting PUT /api/v1/admin/ai/config; on success, calls the parent's
// onSaved with the gateway response so the dashboard immediately
// reflects the new state without a router.refresh() (this page is a
// client component, so refresh() is a no-op).

import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  NumberInput,
  Radio,
  RadioGroup,
  Switch,
  useDisclosure,
} from "@heroui/react";
import { useState } from "react";

import { ApiErrorView } from "@/components/api-error";
import { PasswordInput } from "@/components/password-field";
import {
  TypeAIConfig,
  TypeAITestResult,
  testAIConnection,
  updateAdminAIConfig,
} from "@/data/api-client";
import { useActivityCenter } from "@/data/use-activity-center";

interface Props {
  config: TypeAIConfig;
  onSaved: (next: TypeAIConfig) => void;
}

export function AIConfigEditButton({ config, onSaved }: Props) {
  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="rounded bg-primary px-3 py-1 text-sm text-white hover:opacity-90"
      >
        编辑 →
      </button>
      {isOpen && (
        <EditModal
          config={config}
          isOpen={isOpen}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </>
  );
}

function EditModal({
  config,
  isOpen,
  onClose,
  onSaved,
}: Props & { isOpen: boolean; onClose: () => void }) {
  const [modelFamily, setModelFamily] = useState<TypeAIConfig["modelFamily"]>(
    config.modelFamily,
  );
  const [anthropicPrimary, setAnthropicPrimary] = useState(
    config.anthropicPrimaryModel,
  );
  const [anthropicRefine, setAnthropicRefine] = useState(
    config.anthropicRefineModel,
  );
  const [openaiPrimary, setOpenaiPrimary] = useState(config.openaiPrimaryModel);
  const [openaiRefine, setOpenaiRefine] = useState(config.openaiRefineModel);
  const [anthropicBaseURL, setAnthropicBaseURL] = useState(
    config.anthropicBaseURL,
  );
  const [openaiBaseURL, setOpenaiBaseURL] = useState(config.openaiBaseURL);
  const [deepseekBaseURL, setDeepseekBaseURL] = useState(
    config.deepseekBaseURL,
  );
  const [deepseekPrimary, setDeepseekPrimary] = useState(
    config.deepseekPrimaryModel,
  );
  const [deepseekRefine, setDeepseekRefine] = useState(
    config.deepseekRefineModel,
  );
  const [budgetPerStudy, setBudgetPerStudy] = useState(config.budgetUsdPerStudy);
  const [budgetPerDay, setBudgetPerDay] = useState(config.budgetUsdPerDay);
  const [lookbackDays, setLookbackDays] = useState(config.lookbackDays);

  // Streaming dispatch toggle. Defaults to `true` when the gateway
  // hasn't surfaced the field yet (older deploys); Boolean() coerces
  // `undefined` to `false` so we OR with explicit `true` for that case.
  const [streamingEnabled, setStreamingEnabled] = useState<boolean>(
    config.streamingEnabled ?? true,
  );

  // Per-family test-connection state. Each family records {status,
  // result}; "idle" means no test run yet, "running" while in-flight,
  // "done" once a result is in. The result mirrors the gateway shape;
  // a non-empty `error` means ok=false (treated as failure).
  type TestState =
    | { status: "idle" }
    | { status: "running" }
    | { status: "done"; result: TypeAITestResult };
  const activity = useActivityCenter();
  const [testStates, setTestStates] = useState<{
    anthropic: TestState;
    openai: TestState;
    deepseek: TestState;
  }>({
    anthropic: { status: "idle" },
    openai: { status: "idle" },
    deepseek: { status: "idle" },
  });

  const runTest = async (family: "anthropic" | "openai" | "deepseek") => {
    setTestStates((s) => ({ ...s, [family]: { status: "running" } }));
    const activityId = activity.push({
      kind: "ai-test",
      label: `AI 连通测试 (${family})`,
    });
    try {
      const result = await testAIConnection({ family });
      setTestStates((s) => ({ ...s, [family]: { status: "done", result } }));
      activity.update(activityId, {
        status: result.ok ? "success" : "failed",
        detail: result.ok
          ? `${result.modelTested} · ${result.latencyMs}ms`
          : result.error || "unknown error",
      });
    } catch (e) {
      // Render the network / 4xx failure into the same shape so the
      // inline UI doesn't branch.
      const msg = e instanceof Error ? e.message : String(e);
      setTestStates((s) => ({
        ...s,
        [family]: {
          status: "done",
          result: {
            ok: false,
            family,
            modelTested: "",
            baseUrl: "",
            latencyMs: 0,
            error: msg,
          },
        },
      }));
      activity.update(activityId, { status: "failed", detail: msg });
    }
  };

  // Plaintext API keys. We deliberately do NOT seed these from `config`
  // — the gateway never echoes the key back, and the input being empty
  // means "leave the persisted ciphertext untouched" on save. Setting a
  // non-empty value triggers an encrypt+persist on the server side.
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [deepseekApiKey, setDeepseekApiKey] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Inline validation. Returns null when clean, otherwise an error
  // string to render below the form. Gateway re-validates anyway —
  // these checks are purely a UX optimisation.
  const validationError = (): string | null => {
    if (budgetPerStudy <= 0) return "每 study 预算必须为正数";
    if (budgetPerDay <= 0) return "每日预算必须为正数";
    if (budgetPerDay < budgetPerStudy) {
      return "每日预算必须 ≥ 每 study 预算";
    }
    if (lookbackDays < 7 || lookbackDays > 365) {
      return "查找窗口必须在 7..365 天之间";
    }
    if (modelFamily === "claude") {
      if (!anthropicPrimary.trim()) return "Anthropic 主模型不能为空";
      if (!anthropicRefine.trim()) return "Anthropic refine 模型不能为空";
    } else if (modelFamily === "openai") {
      if (!openaiPrimary.trim()) return "OpenAI 主模型不能为空";
      if (!openaiRefine.trim()) return "OpenAI refine 模型不能为空";
    } else {
      if (!deepseekPrimary.trim()) return "DeepSeek 主模型不能为空";
      if (!deepseekRefine.trim()) return "DeepSeek refine 模型不能为空";
    }
    return null;
  };

  const onSave = async () => {
    const v = validationError();
    if (v) {
      setError(new Error(v));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await updateAdminAIConfig({
        modelFamily,
        anthropicPrimaryModel: anthropicPrimary,
        anthropicRefineModel: anthropicRefine,
        openaiPrimaryModel: openaiPrimary,
        openaiRefineModel: openaiRefine,
        deepseekPrimaryModel: deepseekPrimary,
        deepseekRefineModel: deepseekRefine,
        anthropicBaseURL,
        openaiBaseURL,
        deepseekBaseURL,
        budgetUsdPerStudy: budgetPerStudy,
        budgetUsdPerDay: budgetPerDay,
        lookbackDays,
        streamingEnabled,
        // Plaintext keys — only sent when non-empty. Empty string would
        // be ignored server-side but we strip them client-side too so
        // the request body stays minimal.
        ...(anthropicApiKey ? { anthropicApiKey } : {}),
        ...(openaiApiKey ? { openaiApiKey } : {}),
        ...(deepseekApiKey ? { deepseekApiKey } : {}),
      });
      // Wipe in-memory plaintext on success so a stale modal can't leak
      // it via React Devtools / hot-reload.
      setAnthropicApiKey("");
      setOpenaiApiKey("");
      setDeepseekApiKey("");
      onSaved(next);
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
      <ModalContent>
        {(close) => (
          <>
            <ModalHeader>编辑 AI 配置</ModalHeader>
            <ModalBody>
              <div className="space-y-4">
                <ApiErrorView error={error} />

                <RadioGroup
                  label="模型族"
                  description="主优化循环使用的 LLM 供应商；切换后立即生效（下一次 optimize tick）。"
                  orientation="horizontal"
                  value={modelFamily}
                  onValueChange={(v) =>
                    setModelFamily(v as TypeAIConfig["modelFamily"])
                  }
                >
                  <Radio value="claude">claude</Radio>
                  <Radio value="openai">openai</Radio>
                  <Radio value="deepseek">deepseek</Radio>
                </RadioGroup>

                <div className="rounded border border-default-200 p-3 space-y-3">
                  <div className="text-xs font-semibold text-default-700">
                    API Keys
                  </div>
                  <p className="text-xs text-default-500">
                    密钥在服务端 AES-256-GCM 加密后保存到 Mongo。留空 = 保持
                    当前已存的密文不变；输入新值 = 覆盖。响应永远不会回显密钥
                    （明文/密文都不会）。
                  </p>
                  <PasswordInput
                    size="sm"
                    label="Anthropic API key"
                    description={
                      config.anthropicApiKeyConfigured
                        ? "已配置；留空保持当前值"
                        : "未配置；输入并保存以启用"
                    }
                    placeholder={
                      config.anthropicApiKeyConfigured
                        ? "••••••••（保持当前值）"
                        : "sk-ant-..."
                    }
                    value={anthropicApiKey}
                    onValueChange={setAnthropicApiKey}
                  />
                  <PasswordInput
                    size="sm"
                    label="OpenAI API key"
                    description={
                      config.openaiApiKeyConfigured
                        ? "已配置；留空保持当前值"
                        : "未配置；输入并保存以启用"
                    }
                    placeholder={
                      config.openaiApiKeyConfigured
                        ? "••••••••（保持当前值）"
                        : "sk-..."
                    }
                    value={openaiApiKey}
                    onValueChange={setOpenaiApiKey}
                  />
                  <PasswordInput
                    size="sm"
                    label="DeepSeek API key"
                    description={
                      config.deepseekApiKeyConfigured
                        ? "已配置；留空保持当前值"
                        : "未配置；输入并保存以启用"
                    }
                    placeholder={
                      config.deepseekApiKeyConfigured
                        ? "••••••••（保持当前值）"
                        : "sk-..."
                    }
                    value={deepseekApiKey}
                    onValueChange={setDeepseekApiKey}
                  />
                </div>

                <div className="rounded border border-default-200 p-3 space-y-3">
                  <div className="text-xs font-semibold text-default-700">
                    Anthropic
                    {modelFamily === "claude" && (
                      <span className="ml-2 text-success-600">(当前激活)</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      size="sm"
                      label="主模型"
                      value={anthropicPrimary}
                      onValueChange={setAnthropicPrimary}
                      placeholder="claude-sonnet-4-6"
                    />
                    <Input
                      size="sm"
                      label="refine 模型"
                      value={anthropicRefine}
                      onValueChange={setAnthropicRefine}
                      placeholder="claude-haiku-4-5-20251001"
                    />
                  </div>
                  <Input
                    size="sm"
                    label="Anthropic base URL"
                    description="留空 = 使用 SDK 默认 (api.anthropic.com)"
                    value={anthropicBaseURL}
                    onValueChange={setAnthropicBaseURL}
                    placeholder="https://api.anthropic.com"
                  />
                  <TestConnectionRow
                    state={testStates.anthropic}
                    onTest={() => runTest("anthropic")}
                  />
                </div>

                <div className="rounded border border-default-200 p-3 space-y-3">
                  <div className="text-xs font-semibold text-default-700">
                    OpenAI
                    {modelFamily === "openai" && (
                      <span className="ml-2 text-success-600">(当前激活)</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      size="sm"
                      label="主模型"
                      value={openaiPrimary}
                      onValueChange={setOpenaiPrimary}
                      placeholder="gpt-5"
                    />
                    <Input
                      size="sm"
                      label="refine 模型"
                      value={openaiRefine}
                      onValueChange={setOpenaiRefine}
                      placeholder="gpt-5-mini"
                    />
                  </div>
                  <Input
                    size="sm"
                    label="OpenAI base URL"
                    description="留空 = 使用 SDK 默认 (api.openai.com)"
                    value={openaiBaseURL}
                    onValueChange={setOpenaiBaseURL}
                    placeholder="https://api.openai.com/v1"
                  />
                  <TestConnectionRow
                    state={testStates.openai}
                    onTest={() => runTest("openai")}
                  />
                </div>

                <div className="rounded border border-default-200 p-3 space-y-3">
                  <div className="text-xs font-semibold text-default-700">
                    DeepSeek
                    {modelFamily === "deepseek" && (
                      <span className="ml-2 text-success-600">(当前激活)</span>
                    )}
                    <span className="ml-2 text-default-500 font-normal">
                      OpenAI 兼容；走 chat.completions 接口
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      size="sm"
                      label="主模型"
                      value={deepseekPrimary}
                      onValueChange={setDeepseekPrimary}
                      placeholder="deepseek-chat"
                    />
                    <Input
                      size="sm"
                      label="refine 模型"
                      value={deepseekRefine}
                      onValueChange={setDeepseekRefine}
                      placeholder="deepseek-chat"
                    />
                  </div>
                  <Input
                    size="sm"
                    label="DeepSeek base URL"
                    description="第三方中转/自建 OpenAI 兼容代理；留空 = api.deepseek.com"
                    value={deepseekBaseURL}
                    onValueChange={setDeepseekBaseURL}
                    placeholder="https://api.deepseek.com"
                  />
                  <TestConnectionRow
                    state={testStates.deepseek}
                    onTest={() => runTest("deepseek")}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <NumberInput
                    size="sm"
                    label="每 study 预算 (USD)"
                    description="单个优化任务的硬上限；超过则中止并标记 OPT_BUDGET_EXCEEDED。"
                    minValue={0.1}
                    step={0.5}
                    value={budgetPerStudy}
                    onValueChange={(v) =>
                      setBudgetPerStudy(Number.isFinite(v) ? v : 0)
                    }
                  />
                  <NumberInput
                    size="sm"
                    label="每日预算 (USD)"
                    description="全局每日上限 (UTC 聚合)；必须 ≥ 每 study 预算。"
                    minValue={0.5}
                    step={1}
                    value={budgetPerDay}
                    onValueChange={(v) =>
                      setBudgetPerDay(Number.isFinite(v) ? v : 0)
                    }
                  />
                </div>

                <NumberInput
                  size="sm"
                  label="查找窗口 (天)"
                  description="optimize 拉取多久的小时线历史；7..365。"
                  minValue={7}
                  maxValue={365}
                  step={1}
                  value={lookbackDays}
                  onValueChange={(v) =>
                    setLookbackDays(Number.isFinite(v) ? Math.round(v) : 0)
                  }
                />

                <div className="rounded border border-default-200 p-3">
                  <Switch
                    size="sm"
                    isSelected={streamingEnabled}
                    onValueChange={setStreamingEnabled}
                  >
                    启用流式响应
                  </Switch>
                  <p className="mt-2 text-xs text-default-500">
                    开启 = AI 调用走流式响应（SSE/chunk），延迟低、可中途观察。
                    关闭 = 一次性返回完整结果，适合调试或避免反代/防火墙中断长连接。
                    默认开启。
                  </p>
                </div>

                <div className="text-xs text-default-500">
                  环境变量 <code>ANTHROPIC_API_KEY</code> /{" "}
                  <code>OPENAI_API_KEY</code> / <code>DEEPSEEK_API_KEY</code>{" "}
                  仍作为一次性迁移期回退；保存表单后 Mongo 中的密文优先生效，
                  env 仅在密文缺失时使用。建议从此页输入后清除 env。
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button size="sm" variant="flat" onPress={close}>
                取消
              </Button>
              <Button
                size="sm"
                color="primary"
                isLoading={busy}
                onPress={onSave}
              >
                保存
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

// TestConnectionRow renders the "测试连接" button + inline result for one
// provider. The button calls `onTest`, which hits POST /admin/ai/test
// with the persisted (already-saved) config. Results render inline below
// the button so the operator sees latency / error without leaving the
// modal. The hint reminds the operator that newly-typed-but-unsaved
// values aren't part of the test — only persisted state is.
function TestConnectionRow({
  state,
  onTest,
}: {
  state:
    | { status: "idle" }
    | { status: "running" }
    | { status: "done"; result: TypeAITestResult };
  onTest: () => void;
}) {
  return (
    <div className="rounded bg-default-50/60 p-2 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-default-500">
          测试当前已保存的 key/baseURL/主模型组合（不测本框内未保存的修改）
        </span>
        <Button
          size="sm"
          variant="flat"
          isLoading={state.status === "running"}
          onPress={onTest}
        >
          测试连接
        </Button>
      </div>
      {state.status === "done" && <TestResultBadge result={state.result} />}
    </div>
  );
}

function TestResultBadge({ result }: { result: TypeAITestResult }) {
  if (result.ok) {
    return (
      <div className="text-xs text-success-700">
        <span className="inline-block h-2 w-2 rounded-full bg-success align-middle" />{" "}
        <span className="font-medium">连接正常</span>{" "}
        <span className="text-default-500">
          ({result.modelTested} · {result.latencyMs}ms)
        </span>
        {result.baseUrl ? (
          <span className="ml-1 font-mono text-default-400">
            {result.baseUrl}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <div className="text-xs text-danger-700">
      <span className="inline-block h-2 w-2 rounded-full bg-danger align-middle" />{" "}
      <span className="font-medium">连接失败</span>{" "}
      {result.latencyMs ? (
        <span className="text-default-500">({result.latencyMs}ms)</span>
      ) : null}
      {result.error ? (
        <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[10px] text-default-600">
          {result.error}
        </pre>
      ) : null}
    </div>
  );
}

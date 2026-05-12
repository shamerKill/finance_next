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
  useDisclosure,
} from "@heroui/react";
import { useState } from "react";

import { ApiErrorView } from "@/components/api-error";
import { TypeAIConfig, updateAdminAIConfig } from "@/data/api-client";

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
  const [budgetPerStudy, setBudgetPerStudy] = useState(config.budgetUsdPerStudy);
  const [budgetPerDay, setBudgetPerDay] = useState(config.budgetUsdPerDay);
  const [lookbackDays, setLookbackDays] = useState(config.lookbackDays);

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
    } else {
      if (!openaiPrimary.trim()) return "OpenAI 主模型不能为空";
      if (!openaiRefine.trim()) return "OpenAI refine 模型不能为空";
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
        anthropicBaseURL,
        openaiBaseURL,
        budgetUsdPerStudy: budgetPerStudy,
        budgetUsdPerDay: budgetPerDay,
        lookbackDays,
      });
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
                </RadioGroup>

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

                <div className="text-xs text-default-500">
                  API 密钥不通过此表单管理。请在部署环境的{" "}
                  <code>ANTHROPIC_API_KEY</code> / <code>OPENAI_API_KEY</code>{" "}
                  环境变量中配置，已配置/未配置状态会回显到本页 (Anthropic /
                  OpenAI 行)。
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

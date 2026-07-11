const PROVIDERS = {
  claude: {
    family: "anthropic",
    label: "Anthropic",
    keyField: "anthropicApiKeyConfigured",
    modelField: "anthropicPrimaryModel",
  },
  openai: {
    family: "openai",
    label: "OpenAI",
    keyField: "openaiApiKeyConfigured",
    modelField: "openaiPrimaryModel",
  },
  deepseek: {
    family: "deepseek",
    label: "DeepSeek",
    keyField: "deepseekApiKeyConfigured",
    modelField: "deepseekPrimaryModel",
  },
};

function providerForConfig(config) {
  const modelFamily = String(config?.modelFamily || "").toLowerCase();
  return PROVIDERS[modelFamily] || PROVIDERS.claude;
}

/**
 * @param {Record<string, unknown> | null | undefined} config
 */
export function aiSettingsAIMoneyWorkflowFromConfig(config = null) {
  const provider = providerForConfig(config);
  const model = String(config?.[provider.modelField] || "").trim() || "未设置";
  const keyConfigured = Boolean(config?.[provider.keyField]);

  if (!keyConfigured) {
    return {
      status: "blocked",
      tone: "warning",
      providerFamily: provider.family,
      title: "AI Money 还不能使用真实 AI",
      summary: `当前启用 ${provider.label}，但 ${provider.label} API key 未配置。AI Money 会退回本地 fallback，无法完成真实市场风向和策略分析。`,
      primaryAction: {
        kind: "edit_config",
        label: "填写并测试 AI 配置",
      },
      nextActions: [
        `点击编辑，填写 ${provider.label} API key。`,
        "保存后在编辑窗口点击测试连接。",
        "连接正常后回到 AI Money 重新分析目标。",
      ],
    };
  }

  return {
    status: "ready",
    tone: "info",
    providerFamily: provider.family,
    title: "AI provider 可用于 AI Money",
    summary: `${provider.label} 已配置 API key，主模型 ${model}。建议先在编辑窗口点击测试连接，确认 baseURL、模型和延迟正常，再回到 AI Money 重新分析。`,
    primaryHref: "/ai-money?intent=rerun_ai",
    primaryAction: {
      kind: "open_link",
      label: "回到 AI Money 重新分析",
    },
    nextActions: [
      "在编辑窗口点击测试连接。",
      "连接正常后回到 AI Money 重新分析目标。",
      "新的分析会替代 fallback 结果。",
    ],
  };
}

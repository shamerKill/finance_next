import assert from "node:assert/strict";
import test from "node:test";

import { aiSettingsAIMoneyWorkflowFromConfig } from "./ai-settings-workflow.mjs";

function baseConfig(overrides = {}) {
  return {
    modelFamily: "claude",
    anthropicPrimaryModel: "claude-3-5-sonnet",
    anthropicRefineModel: "claude-3-5-haiku",
    anthropicBaseURL: "",
    anthropicApiKeyConfigured: false,
    openaiPrimaryModel: "gpt-4.1",
    openaiRefineModel: "gpt-4.1-mini",
    openaiBaseURL: "",
    openaiApiKeyConfigured: false,
    deepseekPrimaryModel: "deepseek-v4-pro",
    deepseekRefineModel: "deepseek-v4-flash",
    deepseekBaseURL: "",
    deepseekApiKeyConfigured: false,
    budgetUsdPerStudy: 5,
    budgetUsdPerDay: 50,
    lookbackDays: 90,
    streamingEnabled: true,
    source: "mongo",
    updatedAt: "2026-06-03T06:45:00Z",
    ...overrides,
  };
}

test("aiSettingsAIMoneyWorkflowFromConfig blocks AI Money when the active provider key is missing", () => {
  const workflow = aiSettingsAIMoneyWorkflowFromConfig(
    baseConfig({ modelFamily: "openai", openaiApiKeyConfigured: false }),
  );

  assert.equal(workflow.status, "blocked");
  assert.equal(workflow.providerFamily, "openai");
  assert.deepEqual(workflow.primaryAction, {
    kind: "edit_config",
    label: "填写并测试 AI 配置",
  });
  assert.ok(workflow.summary.includes("OpenAI API key"));
  assert.ok(workflow.nextActions.some((item) => item.includes("测试连接")));
});

test("aiSettingsAIMoneyWorkflowFromConfig returns users to AI Money when the active provider is configured", () => {
  const workflow = aiSettingsAIMoneyWorkflowFromConfig(
    baseConfig({
      modelFamily: "deepseek",
      deepseekApiKeyConfigured: true,
      deepseekPrimaryModel: "deepseek-reasoner",
    }),
  );

  assert.equal(workflow.status, "ready");
  assert.equal(workflow.providerFamily, "deepseek");
  assert.equal(workflow.primaryHref, "/ai-money?intent=rerun_ai");
  assert.deepEqual(workflow.primaryAction, {
    kind: "open_link",
    label: "回到 AI Money 重新分析",
  });
  assert.ok(workflow.summary.includes("deepseek-reasoner"));
});

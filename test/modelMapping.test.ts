import { describe, expect, it } from "vitest";
import { isClaudeModel, projectModel, providerFromRows } from "../index.js";
import { commandCodeBaselineModels } from "../src/baseline.models.js";

describe("isClaudeModel", () => {
  it("detects Claude ids by convention", () => {
    expect(isClaudeModel("claude-sonnet-5")).toBe(true);
    expect(isClaudeModel("claude-opus-4")).toBe(true);
  });

  it("rejects non-Claude ids", () => {
    expect(isClaudeModel("gpt-5.6-luna")).toBe(false);
    expect(isClaudeModel("deepseek/deepseek-v4-flash")).toBe(false);
    expect(isClaudeModel("zai-org/GLM-5.3")).toBe(false);
  });
});

describe("projectModel", () => {
  it("returns null for invalid rows", () => {
    expect(projectModel({})).toBeNull();
    expect(projectModel({ id: 42 })).toBeNull();
    expect(projectModel({ id: "" })).toBeNull();
  });

  it("routes Claude models to anthropic-messages and the anthropic baseUrl", () => {
    const m = projectModel({ id: "claude-sonnet-5", context_length: 2000000 });
    expect(m).not.toBeNull();
    expect(m?.api).toBe("anthropic-messages");
    expect(m?.baseUrl).toContain("/provider/v1");
  });

  it("routes everything else to openai-completions", () => {
    const m = projectModel({ id: "gpt-5.6-luna", context_length: 131072 });
    expect(m?.api).toBe("openai-completions");
    expect(m?.input).toEqual(["text"]);
    expect(m?.cost).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
  });

  it("caps maxTokens conservatively against a large context window", () => {
    // 2M-context model must not be advertised with a 2M output cap.
    const big = projectModel({ id: "claude-opus-4", context_length: 2000000 });
    expect(big?.maxTokens).toBe(131072);

    // Small-context model stays below the 131072 ceiling.
    const small = projectModel({ id: "x/grok-4.5", context_length: 65536 });
    expect(small?.maxTokens).toBe(65536);
  });

  it("falls back to sensible defaults when context_length is missing", () => {
    const m = projectModel({ id: "zai-org/GLM-5.3" });
    expect(m?.contextWindow).toBe(200000);
    expect(m?.name).toBe("zai-org/GLM-5.3");
  });

  it("prefers name when present", () => {
    const m = projectModel({ id: "kimi", name: "Kimi K3", context_length: 262144 });
    expect(m?.name).toBe("Kimi K3");
  });
});

describe("static baseline (pre-credential discovery)", () => {
  it("ships a non-empty generated baseline with Claude + OpenAI routes", () => {
    expect(commandCodeBaselineModels.length).toBeGreaterThan(0);
    expect(commandCodeBaselineModels.some((r) => r.id.startsWith("claude-"))).toBe(true);
    expect(commandCodeBaselineModels.some((r) => !r.id.startsWith("claude-"))).toBe(true);
  });

  it("projects the baseline into a provider config", () => {
    const cfg = providerFromRows(commandCodeBaselineModels);
    expect(cfg.models.length).toBe(commandCodeBaselineModels.length);
    expect(cfg.baseUrl).toBe("https://api.commandcode.ai/provider/v1");
    expect(cfg.models.every((m) => m.maxTokens <= 131072)).toBe(true);
  });

  it("routes every baseline model to a known api", () => {
    const cfg = providerFromRows(commandCodeBaselineModels);
    const apis = new Set(cfg.models.map((m) => m.api));
    expect(apis.has("anthropic-messages")).toBe(true);
    expect(apis.has("openai-completions")).toBe(true);
    expect([...apis].every((a) => a === "anthropic-messages" || a === "openai-completions")).toBe(true);
  });
});

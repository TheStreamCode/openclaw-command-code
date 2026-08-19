import { describe, expect, it } from "vitest";
import {
  isClaudeModel,
  projectModel,
  providerFromRows,
  resolveCommandCodeDynamicModel,
} from "../index.js";
import { commandCodeBaselineModels } from "../src/baseline.models.js";
import manifest from "../openclaw.plugin.json";

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

describe("resolveCommandCodeDynamicModel", () => {
  it("resolves a baseline model id to a runtime model definition", () => {
    const m = resolveCommandCodeDynamicModel({ provider: "commandcode", modelId: "deepseek/deepseek-v4-flash" });
    expect(m).not.toBeNull();
    expect(m?.id).toBe("deepseek/deepseek-v4-flash");
    expect(m?.name).toBe("DeepSeek V4 Flash (latest)");
    expect(m?.provider).toBe("commandcode");
    expect(m?.api).toBe("openai-completions");
    expect(m?.baseUrl).toBe("https://api.commandcode.ai/provider/v1");
    expect(m?.maxTokens).toBeLessThanOrEqual(131072);
  });

  it("routes Claude ids to anthropic-messages", () => {
    const m = resolveCommandCodeDynamicModel({ provider: "commandcode", modelId: "claude-sonnet-5" });
    expect(m?.api).toBe("anthropic-messages");
  });

  it("strips a leading provider prefix from the model id", () => {
    const m = resolveCommandCodeDynamicModel({ provider: "commandcode", modelId: "commandcode/gpt-5.6-luna" });
    expect(m?.id).toBe("gpt-5.6-luna");
    expect(m?.api).toBe("openai-completions");
  });

  it("falls back to conservative defaults for unknown ids", () => {
    const m = resolveCommandCodeDynamicModel({ provider: "commandcode", modelId: "some/future-model" });
    expect(m?.id).toBe("some/future-model");
    expect(m?.name).toBe("some/future-model");
    expect(m?.api).toBe("openai-completions");
    expect(m?.contextWindow).toBe(200000);
    expect(m?.maxTokens).toBe(131072);
    expect(m?.input).toEqual(["text"]);
  });

  it("derives the Claude route by id convention for unknown ids", () => {
    const m = resolveCommandCodeDynamicModel({ provider: "commandcode", modelId: "claude-future-model" });
    expect(m?.api).toBe("anthropic-messages");
  });
});

describe("manifest modelCatalog (drift guard)", () => {
  const catalog = manifest.modelCatalog.providers.commandcode;
  const projected = providerFromRows(commandCodeBaselineModels);

  it("mirrors the baseline projection model by model", () => {
    expect(catalog.models.length).toBe(projected.models.length);
    const byId = new Map(projected.models.map((m) => [m.id, m]));
    for (const entry of catalog.models) {
      const expected = byId.get(entry.id);
      expect(expected, `manifest model ${entry.id} missing from baseline projection`).toBeDefined();
      expect(entry.name).toBe(expected?.name);
      expect(entry.api).toBe(expected?.api);
      expect(entry.baseUrl).toBe(expected?.baseUrl);
      expect(entry.reasoning).toBe(expected?.reasoning);
      expect(entry.input).toEqual(expected?.input);
      expect(entry.contextWindow).toBe(expected?.contextWindow);
      expect(entry.maxTokens).toBe(expected?.maxTokens);
      expect(entry.cost).toEqual(expected?.cost);
    }
  });

  it("keeps ids in the same order as the baseline", () => {
    expect(catalog.models.map((m) => m.id)).toEqual(
      commandCodeBaselineModels.map((r) => r.id),
    );
  });

  it("declares static discovery and the provider-level transport", () => {
    expect(manifest.modelCatalog.discovery.commandcode).toBe("static");
    expect(catalog.baseUrl).toBe("https://api.commandcode.ai/provider/v1");
    expect(catalog.api).toBe("openai-completions");
  });
});

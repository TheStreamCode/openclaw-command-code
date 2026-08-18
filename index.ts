/**
 * Command Code model provider plugin for OpenClaw.
 *
 * Registers an OpenAI/Anthropic-compatible provider backed by the Command Code
 * Provider API (https://commandcode.ai) with FULL live model discovery:
 * the model catalog is fetched at runtime from
 * `GET https://api.commandcode.ai/provider/v1/models` and is never hardcoded.
 *
 * Auth: `COMMAND_CODE_API_KEY` (Studio > API Keys). Requires a plan with API
 * access (GOAT / Pro / Max / Team / Provider); the Go plan returns 403
 * `upgrade_required`.
 */
import {
  defineSingleProviderPluginEntry,
} from "openclaw/plugin-sdk/provider-entry";
import {
  getCachedLiveProviderModelRows,
} from "openclaw/plugin-sdk/provider-catalog-live-runtime";
import type {
  ModelApi,
  ModelDefinitionConfig,
  ModelProviderConfig,
} from "openclaw/plugin-sdk/provider-model-types";

/** Endpoint that lists available models. Public (no auth required for the list). */
const MODELS_ENDPOINT = "https://api.commandcode.ai/provider/v1/models";

/** Base URL for OpenAI-compatible (chat/completions) traffic. */
const OPENAI_BASE_URL = "https://api.commandcode.ai/provider/v1";

/** Base URL for Anthropic-compatible (messages) traffic. */
const ANTHROPIC_BASE_URL = "https://api.commandcode.ai/provider/v1";

/** Cache TTL for the live model catalog (ms). */
const CATALOG_TTL_MS = 60_000;

/** Row shape returned by the Command Code /models endpoint. */
type CommandCodeModelRow = {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
};

/** Derives the Claude (Anthropic-messages) models by id convention. */
export function isClaudeModel(modelId: string): boolean {
  return modelId.startsWith("claude-");
}

/**
 * Maps a live Command Code model row to an OpenClaw model definition.
 *
 * The `/models` endpoint returns `id`, `name`, and `context_length` only. It
 * does NOT expose per-token pricing, max output tokens, or input modalities.
 * Those are therefore set to conservative provider-neutral defaults here and
 * documented as such; they can be enriched later without hardcoding the model
 * list itself.
 */
export function projectModel(row: CommandCodeModelRow): ModelDefinitionConfig | null {
  const id = typeof row.id === "string" && row.id.length > 0 ? row.id : null;
  if (!id) return null;

  const rawName = row.name;
  const name =
    typeof rawName === "string" && rawName.length > 0 ? rawName : id;

  const rawCtx = row.context_length;
  const contextWindow =
    typeof rawCtx === "number" && rawCtx > 0 ? rawCtx : 200_000;

  const claude = isClaudeModel(id);
  const api: ModelApi = claude ? "anthropic-messages" : "openai-completions";

  return {
    id,
    name,
    api,
    // Base URL per model so Claude models hit /messages and everything else
    // hits /chat/completions. Both paths live under the same /provider/v1 host.
    baseUrl: claude ? ANTHROPIC_BASE_URL : OPENAI_BASE_URL,
    reasoning: true,
    // Input modalities are not reported by /models. Stay conservative (text)
    // so models without vision support are never sent image input.
    input: ["text"],
    // Pricing is not returned by /models; set to zero to avoid fabricating
    // prices. See README for the enrichment note.
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow,
    // Output budget is not returned by /models. Use a conservative per-model
    // cap that stays within a sane ceiling for large-context models.
    maxTokens: Math.min(contextWindow, 131_072),
  };
}

/**
 * Builds the provider config with a fully live-discovered catalog fetched from
 * the Command Code Provider API. No model list is hardcoded here.
 */
async function buildProvider(): Promise<ModelProviderConfig> {
  const rows = await getCachedLiveProviderModelRows({
    providerId: "commandcode",
    endpoint: MODELS_ENDPOINT,
    ttlMs: CATALOG_TTL_MS,
    auditContext: "commandcode-model-discovery",
    // Endpoint already returns the OpenAI `{ data: [{ id, object, ... }] }`
    // shape, so the default row/readModel handling covers it. No custom readRows
    // or readModelId needed.
  });

  const models = rows
    .map((row) => projectModel(row as CommandCodeModelRow))
    .filter((m): m is ModelDefinitionConfig => m !== null);

  return {
    baseUrl: OPENAI_BASE_URL,
    api: "openai-completions",
    models,
  };
}

export default defineSingleProviderPluginEntry({
  id: "commandcode",
  name: "Command Code",
  description:
    "Command Code (commandcode.ai) model provider with live model discovery.",
  provider: {
    label: "Command Code",
    docsPath: "/providers/commandcode",
    auth: [
      {
        methodId: "api-key",
        label: "Command Code API key",
        hint: "API key from commandcode.ai Studio > API Keys",
        optionKey: "commandcodeApiKey",
        flagName: "--commandcode-api-key",
        envVar: "COMMAND_CODE_API_KEY",
        promptMessage: "Enter your Command Code API key",
        defaultModel: "commandcode/deepseek/deepseek-v4-flash",
      },
    ],
    catalog: {
      // Live-discovered catalog. The /models endpoint is public, so discovery
      // works before the user configures a key; inference still requires it.
      buildProvider,
    },
  },
});

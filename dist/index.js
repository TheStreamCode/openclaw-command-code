/**
 * Command Code model provider plugin for OpenClaw.
 *
 * Registers an OpenAI/Anthropic-compatible provider backed by the Command Code
 * Provider API (https://commandcode.ai). The model catalog uses a two-tier
 * strategy:
 *
 *   - `buildStaticProvider`: a bundled baseline snapshot (generated, never
 *     hand-edited) so models are discoverable before credentials resolve.
 *   - `buildProvider`: the live catalog fetched at runtime from
 *     `GET https://api.commandcode.ai/provider/v1/models` with a short TTL,
 *     keeping models fresh when the gateway is running.
 *   - `resolveCommandCodeDynamicModel`: a runtime model resolver for ids
 *     missing from the per-agent registry (models.json). OpenClaw only
 *     materializes a provider into that registry when its auth can be proven
 *     at planning time (env var, auth profile, or explicit config); without
 *     that proof, resolution falls through to this hook instead of failing
 *     with "Unknown model".
 *
 * Auth: `COMMAND_CODE_API_KEY` (Studio > API Keys). Requires a plan with API
 * access (GOAT / Pro / Max / Team / Provider); the Go plan returns 403
 * `upgrade_required`.
 */
import { defineSingleProviderPluginEntry, } from "openclaw/plugin-sdk/provider-entry";
import { getCachedLiveProviderModelRows, } from "openclaw/plugin-sdk/provider-catalog-live-runtime";
import { commandCodeBaselineModels } from "./src/baseline.models.js";
/** Endpoint that lists available models. Public (no auth required for the list). */
const MODELS_ENDPOINT = "https://api.commandcode.ai/provider/v1/models";
/** Base URL for OpenAI-compatible (chat/completions) traffic. */
const OPENAI_BASE_URL = "https://api.commandcode.ai/provider/v1";
/** Base URL for Anthropic-compatible (messages) traffic. */
const ANTHROPIC_BASE_URL = "https://api.commandcode.ai/provider/v1";
/** Cache TTL for the live model catalog (ms). */
const CATALOG_TTL_MS = 60_000;
/** Derives the Claude (Anthropic-messages) models by id convention. */
export function isClaudeModel(modelId) {
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
export function projectModel(row) {
    const id = typeof row.id === "string" && row.id.length > 0 ? row.id : null;
    if (!id)
        return null;
    const rawName = row.name;
    const name = typeof rawName === "string" && rawName.length > 0 ? rawName : id;
    const rawCtx = row.context_length;
    const contextWindow = typeof rawCtx === "number" && rawCtx > 0 ? rawCtx : 200_000;
    const claude = isClaudeModel(id);
    const api = claude ? "anthropic-messages" : "openai-completions";
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
 * Builds the provider config from a set of Command Code model rows, mapping each
 * row through the shared projection. Used by both the live catalog (fetched at
 * runtime) and the static baseline (bundled snapshot for pre-credential
 * discovery), so the two never drift in shape.
 */
export function providerFromRows(rows) {
    const models = rows
        .map((row) => projectModel(row))
        .filter((m) => m !== null);
    return {
        baseUrl: OPENAI_BASE_URL,
        api: "openai-completions",
        models,
    };
}
/**
 * Builds the provider config with a fully live-discovered catalog fetched from
 * the Command Code Provider API. No model list is hardcoded here.
 */
async function buildProvider() {
    const rows = await getCachedLiveProviderModelRows({
        providerId: "commandcode",
        endpoint: MODELS_ENDPOINT,
        ttlMs: CATALOG_TTL_MS,
        auditContext: "commandcode-model-discovery",
        // Endpoint already returns the OpenAI `{ data: [{ id, object, ... }] }`
        // shape, so the default row/readModel handling covers it. No custom readRows
        // or readModelId needed.
    });
    return providerFromRows(rows);
}
/**
 * Builds the provider config from the bundled static baseline. This exposes
 * models for cheap pre-credential discovery (models list without a resolved
 * key / gateway) and is refreshed at runtime by the live catalog above.
 */
async function buildStaticProvider() {
    return providerFromRows(commandCodeBaselineModels);
}
/** Strips a leading `<provider>/` prefix from a runtime model id when present. */
function stripProviderModelPrefix(provider, modelId) {
    const prefix = `${provider}/`;
    return modelId.startsWith(prefix) ? modelId.slice(prefix.length) : modelId;
}
/**
 * Resolves commandcode models missing from the local per-agent registry.
 *
 * OpenClaw only materializes a provider's models into the agent registry
 * (models.json) when its auth can be proven at planning time (env var, auth
 * profile, or explicit config). When that proof is absent, model resolution
 * falls through to this hook instead of failing with "Unknown model".
 *
 * The baseline is consulted synchronously; ids not in the snapshot receive a
 * conservative provider-neutral definition so newly published models keep
 * working without a baseline refresh.
 */
export function resolveCommandCodeDynamicModel(ctx) {
    const provider = ctx.provider ?? "commandcode";
    const modelId = stripProviderModelPrefix(provider, ctx.modelId);
    const row = commandCodeBaselineModels.find((entry) => entry.id === modelId);
    const projected = row ? projectModel(row) : null;
    const claude = isClaudeModel(modelId);
    const api = projected?.api ?? (claude ? "anthropic-messages" : "openai-completions");
    const contextWindow = projected?.contextWindow ?? 200_000;
    return {
        id: modelId,
        name: projected?.name ?? modelId,
        api,
        provider,
        baseUrl: claude ? ANTHROPIC_BASE_URL : OPENAI_BASE_URL,
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow,
        maxTokens: Math.min(contextWindow, 131_072),
    };
}
export default defineSingleProviderPluginEntry({
    id: "commandcode",
    name: "Command Code",
    description: "Command Code (commandcode.ai) model provider with live model discovery.",
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
            // Static baseline for discovery before credentials are resolved. The
            // baseline is generated from the live endpoint (scripts/generate-baseline.mjs)
            // and is kept fresh at runtime by the live catalog above.
            buildStaticProvider,
        },
        // Resolves commandcode models that are missing from the per-agent registry
        // (see resolveCommandCodeDynamicModel) so inference never fails with
        // "Unknown model" when the planner could not prove auth.
        resolveDynamicModel: resolveCommandCodeDynamicModel,
    },
});

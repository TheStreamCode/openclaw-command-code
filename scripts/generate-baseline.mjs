/**
 * Generates the static baseline module (`src/baseline.models.ts`) and the
 * `modelCatalog` block of `openclaw.plugin.json` from the live Command Code
 * `/models` endpoint.
 *
 * The baseline is NOT hand-edited: it is a snapshot of the public discovery
 * endpoint, so the plugin exposes models even before credentials are resolved
 * (no gateway/runtime needed). The single source of truth remains the live
 * endpoint, which `buildProvider` still queries at runtime.
 *
 * The manifest `modelCatalog` mirrors the same rows because `openclaw models
 * list` resolves non-bundled plugin models from the manifest catalog (the
 * runtime `registerModelCatalogProvider` hooks only feed the live/static
 * discovery surfaces, not the CLI listing). The projection here MUST stay in
 * sync with `projectModel` in `index.ts`.
 *
 * Regenerate when the provider catalog changes:
 *   node scripts/generate-baseline.mjs
 */
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MODELS_ENDPOINT = "https://api.commandcode.ai/provider/v1/models";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_BASELINE = join(ROOT, "src", "baseline.models.ts");
const OUT_MANIFEST = join(ROOT, "openclaw.plugin.json");

// Mirrors index.ts: OPENAI_BASE_URL / ANTHROPIC_BASE_URL share one host.
const BASE_URL = "https://api.commandcode.ai/provider/v1";
const DEFAULT_CONTEXT = 200_000;
const MAX_OUTPUT_TOKENS = 131_072;

const res = await fetch(MODELS_ENDPOINT, {
  headers: { accept: "application/json" },
});
if (!res.ok) {
  throw new Error(`GET ${MODELS_ENDPOINT} failed: HTTP ${res.status}`);
}
const body = await res.json();
const rows = Array.isArray(body?.data) ? body.data : [];

// Keep only the raw fields the plugin projects (id/name/context_length), so the
// baseline stays schema-stable and cheap.
const baseline = rows
  .filter((r) => r && typeof r.id === "string" && r.id.length > 0)
  .map((r) => ({
    id: r.id,
    ...(typeof r.name === "string" && r.name.length > 0 ? { name: r.name } : {}),
    ...(typeof r.context_length === "number" && r.context_length > 0
      ? { context_length: r.context_length }
      : {}),
  }));

// ---- baseline module -------------------------------------------------------

const json = JSON.stringify(baseline, null, 2);

const header = [
  "/**",
  " * Static baseline model catalog for Command Code.",
  " *",
  " * GENERATED - do not edit by hand. Run 'node scripts/generate-baseline.mjs'",
  " * to refresh it from the live endpoint.",
  " *",
  " * Exposes models for pre-credential discovery (models list without a",
  " * resolved key / gateway). The live endpoint remains the source of truth",
  " * and is re-queried at runtime by buildProvider.",
  " */",
  "export const commandCodeBaselineModels: Array<{",
  "  id: string;",
  "  name?: string;",
  "  context_length?: number;",
  "}> = " + json + ";",
  "",
].join("\n");

mkdirSync(dirname(OUT_BASELINE), { recursive: true });
writeFileSync(OUT_BASELINE, header);

// ---- manifest modelCatalog -------------------------------------------------

/**
 * Mirrors `projectModel` in index.ts. Keep the two in sync: any change to the
 * projection (api split, maxTokens cap, input modalities, cost defaults) must
 * be reflected here too.
 */
function projectManifestModel(row) {
  const id = row.id;
  const claude = id.startsWith("claude-");
  const contextWindow =
    typeof row.context_length === "number" && row.context_length > 0
      ? row.context_length
      : DEFAULT_CONTEXT;

  return {
    id,
    name: row.name ?? id,
    api: claude ? "anthropic-messages" : "openai-completions",
    // Per-row baseUrl is required by OpenClaw's manifest model-catalog
    // projection (providerConfigFromManifestRows): without it, the non-bundled
    // plugin catalog is dropped and the agent registry never materializes a
    // commandcode catalog, so runtime inference reports "Unknown model".
    baseUrl: BASE_URL,
    reasoning: true,
    input: ["text"],
    contextWindow,
    maxTokens: Math.min(contextWindow, MAX_OUTPUT_TOKENS),
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

const manifest = JSON.parse(readFileSync(OUT_MANIFEST, "utf8"));
manifest.modelCatalog = {
  providers: {
    commandcode: {
      baseUrl: BASE_URL,
      api: "openai-completions",
      models: baseline.map(projectManifestModel),
    },
  },
  discovery: {
    commandcode: "static",
  },
};
writeFileSync(OUT_MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

console.log(
  `Wrote baseline module with ${baseline.length} models -> ${OUT_BASELINE}`,
);
console.log(
  `Wrote manifest modelCatalog with ${baseline.length} models -> ${OUT_MANIFEST}`,
);

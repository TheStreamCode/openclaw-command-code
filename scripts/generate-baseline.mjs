/**
 * Generates the static baseline module (`src/baseline.models.ts`) from the live
 * Command Code `/models` endpoint.
 *
 * The baseline is NOT hand-edited: it is a snapshot of the public discovery
 * endpoint, so the plugin exposes models even before credentials are resolved
 * (no gateway/runtime needed). The single source of truth remains the live
 * endpoint, which `buildProvider` still queries at runtime.
 *
 * Regenerate when the provider catalog changes:
 *   node scripts/generate-baseline.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MODELS_ENDPOINT = "https://api.commandcode.ai/provider/v1/models";
const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "baseline.models.ts",
);

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

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, header);

console.log(`Wrote baseline module with ${baseline.length} models -> ${OUT}`);

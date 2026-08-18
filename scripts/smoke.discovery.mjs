// Smoke test: exercises the live discovery path of the compiled plugin against
// the real Command Code /models endpoint. Run: node scripts/smoke.discovery.mjs
import { createServer } from "node:http";

// Minimal mock of the OpenClaw plugin API surface used by this plugin.
const registeredProviders = [];
const registeredCatalogs = [];
const api = {
  registerProvider: (p) => registeredProviders.push(p),
  registerModelCatalogProvider: (c) => registeredCatalogs.push(c),
};

const { default: entry } = await import("../dist/index.js");
await entry.register(api);

const provider = registeredProviders[0];
console.log("plugin:", entry.id);
console.log("provider id:", provider.id);
console.log("provider label:", provider.label);
console.log("provider envVars:", provider.envVars?.join(","));
console.log("auth methods:", (provider.auth || []).map((a) => a.methodId).join(","));

// Find the catalog implementation.
// defineSingleProviderPluginEntry normalizes `catalog` into run/staticRun.
const catalog = provider.catalog || provider.staticCatalog;
console.log(
  "catalog has run:",
  typeof (catalog?.run ?? catalog?.buildProvider) === "function"
);

let result;
if (typeof catalog?.run === "function") {
  result = await catalog.run({ resolveProviderApiKey: () => ({ apiKey: "cc_TEST_FAKE_KEY_FOR_DISCOVERY" }) });
} else if (typeof catalog?.buildProvider === "function") {
  result = await catalog.buildProvider();
}

const models = result?.provider?.models ?? result?.models ?? [];
console.log("\nmodels discovered (live):", models.length);
const byApi = {};
for (const m of models) byApi[m.api] = (byApi[m.api] || 0) + 1;
console.log("by transport:", JSON.stringify(byApi));

// Spot-check a few ids/routing.
for (const id of ["claude-sonnet-5", "gpt-5.6-luna", "deepseek/deepseek-v4-flash", "zai-org/GLM-5.3", "moonshotai/Kimi-K3"]) {
  const m = models.find((x) => x.id === id);
  if (m) console.log(`  [${id}] -> ${m.api} ctx=${m.contextWindow}`);
  else console.log(`  [${id}] -> NOT FOUND`);
}

console.log("\nbaseUrl:", result?.provider?.baseUrl ?? result?.baseUrl);

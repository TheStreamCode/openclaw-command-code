// Smoke test: exercises both discovery paths of the compiled plugin.
//   - staticCatalog (baseline) works WITHOUT credentials — this is what makes
//     `models list --provider commandcode` show models before a key resolves.
//   - catalog.run (live) refetches from the real /models endpoint.
// Run: node scripts/smoke.discovery.mjs

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

const staticCatalog = provider.staticCatalog;
const liveCatalog = provider.catalog;

console.log("\n-- static baseline (no credentials) --");
if (staticCatalog && typeof staticCatalog.run === "function") {
  const staticRun = await staticCatalog.run({
    resolveProviderApiKey: () => ({ apiKey: undefined }),
  });
  const sModels = staticRun?.provider?.models ?? [];
  const byApi = {};
  for (const m of sModels) byApi[m.api] = (byApi[m.api] || 0) + 1;
  console.log("models (static):", sModels.length, "| by transport:", JSON.stringify(byApi));
  const claude = sModels.find((m) => m.id === "claude-sonnet-5");
  if (claude) console.log(`  [claude-sonnet-5] -> ${claude.api} ctx=${claude.contextWindow} max=${claude.maxTokens}`);
} else {
  console.log("staticCatalog NOT exposed (check entry normalization)");
}

console.log("\n-- live discovery (real endpoint) --");
if (liveCatalog && typeof liveCatalog.run === "function") {
  const liveRun = await liveCatalog.run({
    resolveProviderApiKey: () => ({ apiKey: "cc_TEST_FAKE_KEY_FOR_DISCOVERY" }),
  });
  const models = liveRun?.provider?.models ?? [];
  const byApi = {};
  for (const m of models) byApi[m.api] = (byApi[m.api] || 0) + 1;
  console.log("models (live):", models.length, "| by transport:", JSON.stringify(byApi));
  for (const id of ["claude-sonnet-5", "gpt-5.6-luna", "deepseek/deepseek-v4-flash", "zai-org/GLM-5.3", "moonshotai/Kimi-K3"]) {
    const m = models.find((x) => x.id === id);
    console.log(`  [${id}] -> ${m ? m.api + " ctx=" + m.contextWindow : "NOT FOUND"}`);
  }
  console.log("\nbaseUrl:", liveRun?.provider?.baseUrl);
} else {
  console.log("live catalog NOT exposed (check entry normalization)");
}

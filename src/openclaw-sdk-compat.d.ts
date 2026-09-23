/**
 * Compatibility declarations for openclaw >= 2026.9.x plugin-sdk subpaths.
 *
 * Upstream packaging regression: openclaw 2026.7.1-2 shipped `.d.ts` files for
 * `plugin-sdk/provider-entry`, `plugin-sdk/provider-catalog-live-runtime` and
 * `plugin-sdk/provider-model-types`, while 2026.9.x ships the same `.js`
 * modules WITHOUT type declarations (exports map has `default` only, no
 * `types` condition). Runtime exports were verified unchanged on 2026.9.5:
 * `defineSingleProviderPluginEntry` and `getCachedLiveProviderModelRows` are
 * still exported with the same names; `provider-model-types.js` is an empty
 * `export {}` (type-only module, erased at compile time).
 *
 * The shapes below are copied from the upstream 2026.7.1-2 declarations, with
 * deep cross-chunk references (SecretInput, agent runtime, compat flags)
 * intentionally widened to `unknown` to keep this file self-contained. Only
 * the surface used by this plugin is declared.
 *
 * DELETE THIS FILE once openclaw restores `.d.ts` output for these subpaths
 * (remove, run `npm run typecheck`, and confirm TS7016 is gone).
 */

declare module "openclaw/plugin-sdk/provider-model-types" {
  /** Provider API adapter ids accepted by model/provider config. */
  export type ModelApi =
    | "openai-completions"
    | "openai-responses"
    | "openai-chatgpt-responses"
    | "anthropic-messages"
    | "google-generative-ai"
    | "google-vertex"
    | "github-copilot"
    | "bedrock-converse-stream"
    | "ollama"
    | "azure-openai-responses";

  export type ModelDefinitionConfig = {
    /** Provider-facing model id. */
    id: string;
    /** Human-readable display name. */
    name: string;
    /** Optional API adapter override for this model. */
    api?: ModelApi;
    /** Optional base URL override for this model. */
    baseUrl?: string;
    /** Whether the model supports reasoning/thinking controls. */
    reasoning: boolean;
    /** Supported input modalities for routing and media-tool selection. */
    input: Array<"text" | "image" | "video" | "audio">;
    /** Token pricing in USD per million tokens. */
    cost: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
    };
    /** Provider/native maximum context window in tokens. */
    contextWindow: number;
    /** Maximum completion/output token budget. */
    maxTokens: number;
    /** Remaining upstream fields (compat, params, headers, ...) intentionally widened. */
    [key: string]: unknown;
  };

  export type ModelProviderConfig = {
    /** Provider API base URL. */
    baseUrl: string;
    /** Default API adapter for models under this provider. */
    api?: ModelApi;
    /** Model catalog entries exposed by this provider. */
    models: ModelDefinitionConfig[];
    /** Remaining upstream fields (auth, timeout, params, ...) intentionally widened. */
    [key: string]: unknown;
  };
}

declare module "openclaw/plugin-sdk/provider-catalog-live-runtime" {
  export type LiveModelCatalogHeaderContext = {
    apiKey?: string;
    discoveryApiKey?: string;
  };

  export type FetchLiveProviderModelIdsParams = {
    providerId: string;
    endpoint: string;
    apiKey?: string;
    discoveryApiKey?: string;
    fetchGuard?: unknown;
    signal?: AbortSignal;
    timeoutMs?: number;
    auditContext?: string;
    policy?: unknown;
    lookupFn?: unknown;
    requireHttps?: boolean;
    readRows?: (body: unknown) => readonly unknown[];
    readModelId?: (row: unknown) => string | undefined;
    buildRequestHeaders?: (ctx: LiveModelCatalogHeaderContext) => HeadersInit;
  };

  export type FetchLiveProviderModelRowsParams = Omit<
    FetchLiveProviderModelIdsParams,
    "readModelId"
  >;

  export type CachedLiveProviderModelRowsParams =
    FetchLiveProviderModelRowsParams & {
      ttlMs?: number;
      cacheKeyParts?: readonly unknown[];
      shouldCacheRows?: (rows: readonly unknown[]) => boolean;
    };

  export function getCachedLiveProviderModelRows(
    params: CachedLiveProviderModelRowsParams,
  ): Promise<readonly unknown[]>;
}

declare module "openclaw/plugin-sdk/provider-entry" {
  export type SingleProviderPluginCatalogOptions =
    | {
        buildProvider: () => Promise<
          import("openclaw/plugin-sdk/provider-model-types").ModelProviderConfig
        >;
        buildStaticProvider?: () => Promise<
          import("openclaw/plugin-sdk/provider-model-types").ModelProviderConfig
        >;
        allowExplicitBaseUrl?: boolean;
        run?: never;
        order?: never;
        staticRun?: never;
      }
    | {
        run: unknown;
        staticRun?: unknown;
        order?: unknown;
        buildProvider?: never;
        buildStaticProvider?: never;
        allowExplicitBaseUrl?: never;
      };

  export type SingleProviderPluginOptions = {
    id: string;
    name: string;
    description: string;
    kind?: unknown;
    configSchema?: unknown;
    provider?: {
      id?: string;
      label: string;
      docsPath: string;
      aliases?: string[];
      envVars?: string[];
      auth?: Array<Record<string, unknown>>;
      extraAuth?: unknown[];
      catalog: SingleProviderPluginCatalogOptions;
      resolveDynamicModel?: unknown;
      [key: string]: unknown;
    };
    register?: (api: unknown) => void;
  };

  export function defineSingleProviderPluginEntry(options: SingleProviderPluginOptions): {
    id: string;
    name: string;
    description: string;
    configSchema: unknown;
    register: (...args: unknown[]) => unknown;
    [key: string]: unknown;
  };
}

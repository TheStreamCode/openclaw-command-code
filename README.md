# openclaw-command-code

Command Code ([commandcode.ai](https://commandcode.ai)) model provider plugin for
OpenClaw, with **two-tier model discovery**: a generated static baseline for
pre-credential discovery plus a live catalog refreshed at runtime.

## What it does

- Registers a `commandcode` model provider in OpenClaw.
- **Static baseline** (`src/baseline.models.ts`, generated — never hand-edited):
  exposes models for cheap discovery **before a key is configured**, so
  `models list --provider commandcode` / `/model` can show them without a
  resolved credential or a running gateway.
- **Live catalog**: fetches the current model list at runtime from
  `GET https://api.commandcode.ai/provider/v1/models` (a public endpoint) with
  a short TTL, keeping the catalog fresh when the gateway is running. The live
  endpoint is the single source of truth; the baseline is just its snapshot.
- Routes each model to the correct transport:
  - `claude-*` → **Anthropic Messages** (`/provider/v1/messages`)
  - every other model → **OpenAI Chat Completions** (`/provider/v1/chat/completions`)
- Refreshes the catalog with a short TTL so new/removed models propagate.

## Regenerating the baseline

The bundled baseline is generated from the live endpoint, not maintained by
hand. Refresh it when the provider catalog changes:

```bash
node scripts/generate-baseline.mjs
```

## Requirements

- OpenClaw >= 2026.7.1.
- A Command Code account on a plan **with Provider API access**
  (GOAT / Pro / Max / Team / Provider). The **Go** plan has no API access and
  any request returns HTTP `403 upgrade_required`.

## Install (local dev)

From this directory:

```bash
# with a local path (developing/testing)
openclaw plugins install ./command-code-plugin-openclaw
# or a symlinked dev checkout
openclaw plugins install --link ./command-code-plugin-openclaw
```

## Configure auth

Set the API key from [commandcode.ai Studio > API Keys](https://commandcode.ai/studio):

```bash
openclaw onboard --commandcode-api-key "$COMMAND_CODE_API_KEY"
```

or export the env var the provider reads:

```bash
export COMMAND_CODE_API_KEY=cc_...
```

## Verify

```bash
openclaw models list --provider commandcode
openclaw plugins inspect commandcode --runtime --json
```

Then select a model, e.g.:

```bash
openclaw config set agents.defaults.model.primary "commandcode/deepseek/deepseek-v4-flash"
```

## Model resolution

The static baseline and the live catalog share one projection (`projectModel`);
**ids** and **context windows** come from the `/models` endpoint — the baseline
is a generated snapshot of it, never hand-maintained. Because that endpoint
returns context length but **not** per-token pricing, output limits, or input
modalities, OpenClaw model entries use conservative provider-neutral defaults:

- `cost` is reported as `0` so OpenClaw never displays fabricated prices.
  Enriching costs from the Command Code pricing table is a possible future
  enhancement.
- `maxTokens` is derived per model as `min(contextWindow, 131072)`, so large
  context models are never advertised with an unbounded output cap.
- `input` stays `["text"]` (no vision/additional modality per model is
  advertised, since `/models` does not report it).

## Develop / Test

```bash
npm install
npm run build      # tsc -> dist/index.js
npm test           # vitest: transport + projection mapping
node scripts/generate-baseline.mjs   # refresh src/baseline.models.ts
node scripts/smoke.discovery.mjs     # static(pre-credential) + live discovery smoke
```

The repo intentionally ships **no TypeScript `.d.ts`**: the plugin is consumed
as a runtime entry (`dist/index.js`), not as a typed library, and an exported
definition type would not be portable. `dist/` itself is git-ignored and built
before install/publish.

A GitHub Actions workflow (`.github/workflows/ci.yml`) runs type-check, build,
and unit tests on every push to `main` and on pull requests. Updates to this
tooling are applied manually on purpose — there is no Dependabot or any other
automatic update / notification bot configured.

## Publish (optional)

To make it discoverable on ClawHub:

```bash
clawhub login
clawhub package publish TheStreamCode/openclaw-command-code --dry-run
clawhub package publish TheStreamCode/openclaw-command-code
```

## Files

```
index.ts                # plugin entry: provider + live discovery + transport mapping
openclaw.plugin.json     # manifest (provider id, auth env var, onboarding choice)
package.json             # package + openclaw extension metadata
LICENSE                  # MIT
test/modelMapping.test.ts # vitest unit tests (transport + projection mapping)
scripts/smoke.discovery.mjs # live discovery smoke test against the public endpoint
.github/workflows/ci.yml    # GitHub Actions: typecheck + build + tests
```

## License

MIT

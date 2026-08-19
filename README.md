# openclaw-command-code

Command Code ([commandcode.ai](https://commandcode.ai)) model provider plugin for
OpenClaw, with **three-tier model resolution**: a generated static baseline for
pre-credential discovery, a live catalog refreshed at runtime, and a dynamic
resolver for models missing from the per-agent registry.

## What it does

- Registers a `commandcode` model provider in OpenClaw.
- **Static baseline** (`src/baseline.models.ts`, generated — never hand-edited):
  exposes models for cheap discovery **before a key is configured**, so
  `models list --provider commandcode` / `/model` can show them without a
  resolved credential or a running gateway. The manifest
  (`openclaw.plugin.json`) ships the same snapshot in its `modelCatalog`
  block, so the CLI listing also works for non-bundled plugin installs.
- **Live catalog**: fetches the current model list at runtime from
  `GET https://api.commandcode.ai/provider/v1/models` (a public endpoint) with
  a short TTL, keeping the catalog fresh when the gateway is running. The live
  endpoint is the single source of truth; the baseline is just its snapshot.
- **Dynamic runtime resolution**: OpenClaw only materializes a provider into
  the per-agent model registry (`models.json`) when it can prove auth (env
  var, auth profile, or explicit config). A `resolveDynamicModel` hook answers
  model resolution from the bundled baseline instead, so inference never
  fails with `Unknown model` for commandcode models.
- Routes each model to the correct transport:
  - `claude-*` → **Anthropic Messages** (`/provider/v1/messages`)
  - every other model → **OpenAI Chat Completions** (`/provider/v1/chat/completions`)
- Refreshes the catalog with a short TTL so new/removed models propagate.

## Regenerating the baseline

The bundled baseline is generated from the live endpoint, not maintained by
hand. The script rewrites both `src/baseline.models.ts` and the `modelCatalog`
block of `openclaw.plugin.json` from the same fetched rows, using the same
projection as `projectModel` in `index.ts`. Refresh them when the provider
catalog changes:

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

Set the API key from [commandcode.ai Studio > API Keys](https://commandcode.ai/studio).
Keys are strings starting with `user_`; treat them as secrets.

Pick one of these methods — the key must be resolvable **at inference time**
through either the env var, an auth profile, or an explicit provider config:

```bash
# 1) env var (also picked up by the gateway process)
export COMMAND_CODE_API_KEY=user_...

# 2) auth profile (persists the key in the agent credential store)
openclaw models auth paste-api-key --provider commandcode --profile-id commandcode:default
#    ... paste the key on stdin

# 3) explicit provider config (env var name as the apiKey marker)
openclaw config set 'models.providers.commandcode.apiKey' COMMAND_CODE_API_KEY
```

Model **discovery** works without a key (the `/models` endpoint is public),
but inference requires it. Check the profile state with
`openclaw models auth list`.

## Verify

```bash
openclaw models list --provider commandcode
openclaw plugins inspect commandcode --runtime --json
openclaw agent --local --agent main --model commandcode/deepseek/deepseek-v4-flash --message "hi"
```

Then select a model, e.g.:

```bash
openclaw config set agents.defaults.model.primary "commandcode/deepseek/deepseek-v4-flash"
```

## Model resolution

The static baseline, the manifest catalog, and the live catalog share one
projection (`projectModel` in `index.ts`); **ids** and **context windows** come
from the `/models` endpoint — the baseline is a generated snapshot of it,
never hand-maintained. Because that endpoint returns context length but
**not** per-token pricing, output limits, or input modalities, OpenClaw model
entries use conservative provider-neutral defaults:

- `cost` is reported as `0` so OpenClaw never displays fabricated prices.
  Enriching costs from the Command Code pricing table is a possible future
  enhancement.
- `maxTokens` is derived per model as `min(contextWindow, 131072)`, so large
  context models are never advertised with an unbounded output cap.
- `input` stays `["text"]` (no vision/additional modality per model is
  advertised, since `/models` does not report it).

At inference time, if a model id is not present in the per-agent registry
(which OpenClaw builds from `models.json` plus the auth-proof materialization
described above), the registered `resolveDynamicModel` hook resolves it
synchronously from the bundled baseline. Unknown ids still resolve to a
conservative provider-neutral definition (by `claude-*` transport convention
where applicable), so newly published models work without re-installing the
plugin or refreshing the baseline.

## Develop / Test

```bash
npm install
npm run build      # tsc -> dist/index.js
npm test           # vitest: transport + projection + dynamic resolution
node scripts/generate-baseline.mjs   # refresh baseline + manifest modelCatalog
node scripts/smoke.discovery.mjs     # static(pre-credential) + live discovery smoke
node scripts/live-test.mjs           # live inference (reads the key from ~/.openclaw/secrets/providers.json)
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
index.ts                    # plugin entry: provider + live/static catalog + dynamic resolution
src/baseline.models.ts       # generated baseline snapshot (never hand-edited)
openclaw.plugin.json         # manifest (provider id, auth env var, onboarding choice, modelCatalog)
package.json                 # package + openclaw extension metadata
LICENSE                      # MIT
test/modelMapping.test.ts    # vitest unit tests (transport, projection, dynamic resolution)
scripts/generate-baseline.mjs # rewrites the baseline module + manifest modelCatalog
scripts/smoke.discovery.mjs   # live discovery smoke test against the public endpoint
scripts/live-test.mjs         # live inference test using the stored key (never printed)
.github/workflows/ci.yml      # GitHub Actions: typecheck + build + tests
```

## License

MIT

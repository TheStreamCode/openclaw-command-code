# openclaw-command-code

Command Code model provider for OpenClaw with three-tier model resolution

[![CI](https://github.com/TheStreamCode/openclaw-command-code/actions/workflows/ci.yml/badge.svg)](https://github.com/TheStreamCode/openclaw-command-code/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![ClawHub](https://img.shields.io/badge/ClawHub-%40thestreamcode%2Fopenclaw--command--code-blue)](https://clawhub.ai/plugins/@thestreamcode/openclaw-command-code)

Command Code ([commandcode.ai](https://commandcode.ai)) model provider plugin for OpenClaw. The
plugin registers a `commandcode` provider with three-tier model resolution: a generated static
baseline for pre-credential discovery, a live catalog refreshed at runtime, and a dynamic resolver
for models missing from the per-agent registry.

This is an independent, unofficial integration. It is not affiliated with, endorsed by, sponsored
by, or approved by Command Code or OpenClaw.

## Install

From [ClawHub](https://clawhub.ai/plugins/@thestreamcode/openclaw-command-code) (recommended):

```bash
openclaw plugins install clawhub:@thestreamcode/openclaw-command-code
```

From GitHub (requires the committed `dist/` runtime in the repository):

```bash
openclaw plugins install git:github.com/TheStreamCode/openclaw-command-code
```

Append `@<release-tag>` to the repository reference to pin a release.

From a local checkout:

```bash
openclaw plugins install --link .
```

## Quick start

1. Create an API key in [commandcode.ai Studio > API Keys](https://commandcode.ai/settings/keys)
   and treat it as a secret. The same key authenticates the Command Code CLI and the Provider API.
2. Make the key resolvable at inference time through one of the supported methods:

   ```bash
   # 1) environment variable, also picked up by the gateway process
   export COMMAND_CODE_API_KEY=user_...

   # 2) auth profile, persisted in the agent credential store
   openclaw models auth paste-api-key --provider commandcode --profile-id commandcode:default
   #    ... paste the key on stdin

   # 3) explicit provider configuration, using the environment variable name
   openclaw config set 'models.providers.commandcode.apiKey' COMMAND_CODE_API_KEY
   ```

3. Verify discovery and select a model:

   ```bash
   openclaw models list --provider commandcode
   openclaw config set agents.defaults.model.primary "commandcode/deepseek/deepseek-v4-flash"
   openclaw agent --local --agent main --model commandcode/deepseek/deepseek-v4-flash --message "hi"
   ```

Model discovery works without a key because the `/models` endpoint is public; inference requires
the key. Check the auth profile state with `openclaw models auth list`.

## Features

- Registers the `commandcode` provider in OpenClaw.
- Ships a generated static baseline (`src/baseline.models.ts`, never hand-edited) and the same
  snapshot in the manifest `modelCatalog`, so `models list --provider commandcode` and `/model`
  work before a credential or gateway exists.
- Refreshes the live catalog from `GET https://api.commandcode.ai/provider/v1/models` at runtime
  with a short TTL; the live endpoint is the single source of truth.
- Resolves models that the per-agent registry does not contain through a `resolveDynamicModel`
  hook, so inference does not fail with `Unknown model`.
- Routes `claude-*` ids to the Anthropic Messages endpoint and every other model to OpenAI Chat
  Completions.
- Accepts OpenAI function calling, streaming with usage accounting, reasoning effort, and both
  `max_completion_tokens` and `max_tokens` on the verified Provider API.
- Reports provider-neutral model metadata instead of invented prices: `cost` is `0`, `maxTokens`
  is `min(contextWindow, 131072)`, and `input` stays `["text"]`.

## Requirements

- OpenClaw `>= 2026.7.1`; CI builds and tests on Node.js 24.
- A Command Code account on a plan **with Provider API access** (GOAT, Pro, Max, Team, or
  Provider). The **Go** plan has no API access and requests return HTTP `403 upgrade_required`.
- Model availability depends on the plan: models outside it return HTTP `403 MODEL_NOT_IN_PLAN`.
  This error is verified against the live Provider API but is not listed in the public error table
  on the [Provider API docs](https://commandcode.ai/docs/provider#errors).

## Configuration

| Setting | Purpose | Default |
| --- | --- | --- |
| `COMMAND_CODE_API_KEY` | Bearer key for inference; the recommended way to provide it. | none |
| Auth profile `commandcode:default` | Alternative to the environment variable; stored by OpenClaw. | none |
| `models.providers.commandcode.apiKey` | Explicit provider configuration; set it to the env var name. | none |
| `agents.defaults.model.primary` | Default model, for example `commandcode/deepseek/deepseek-v4-flash`. | none |
| Static baseline | Generated snapshot used for pre-credential discovery and dynamic resolution. | shipped in the plugin |

## Privacy and security

The API key is read from the environment variable, the OpenClaw auth profile, or explicit provider
configuration; the plugin never writes it. Do not commit keys, `.env` files, or credential stores.
Discovery uses the public `/models` endpoint, and inference traffic goes to Command Code only. See
[SECURITY.md](SECURITY.md) for vulnerability reporting.

## Troubleshooting

### `No API key found for provider "commandcode"`

Inference requires a resolvable key. Configure one as shown in [Quick start](#quick-start) and
check `openclaw models auth list`.

### HTTP `403 MODEL_NOT_IN_PLAN`

The selected model is not included in your Command Code plan. Pick a model your plan covers, or
upgrade the plan / enable on-demand usage on commandcode.ai.

### HTTP `403 upgrade_required`

The Go plan has no Provider API access. Use a plan that includes the Provider API.

### Model missing from `models list`

Refresh the bundled snapshot with `node scripts/generate-baseline.mjs`; the live catalog picks new
models up automatically at runtime anyway.

## Development

Requirements: Node.js 24 and npm.

```bash
git clone https://github.com/TheStreamCode/openclaw-command-code.git
cd openclaw-command-code
npm install
npm run typecheck
npm run build
npm test
node scripts/generate-baseline.mjs   # refresh baseline and manifest modelCatalog
```

`dist/` is committed because OpenClaw git and package installs require the compiled runtime;
regenerate it with `npm run build` after any source change, and commit it with the source. The
baseline module and the manifest catalog are generated from the same fetched rows; never edit them
by hand. CI fails when the committed `dist/` does not match a fresh build.

Additional scripts: `node scripts/smoke.discovery.mjs` checks static (pre-credential) and live
discovery, and `node scripts/live-test.mjs` runs live inference using the stored key without
printing it.

## Support

Usage questions and workflows belong in GitHub Discussions; reproducible defects belong in GitHub
Issues using the bug report form. See [SUPPORT.md](SUPPORT.md). Problems in Command Code or
OpenClaw themselves belong to their respective projects.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Pull requests must pass the required CI checks.

## License

MIT — see [`LICENSE`](LICENSE).

---

Maintained by [Michael Gasperini (Mikesoft)](https://mikesoft.it).
If this project is useful to you, consider
[sponsoring its maintenance](https://github.com/sponsors/TheStreamCode).

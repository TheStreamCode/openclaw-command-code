# AGENTS.md

Command Code (commandcode.ai) model provider plugin for OpenClaw, with three-tier model resolution: a generated static baseline for pre-credential discovery, a live catalog refreshed at runtime, and a dynamic resolver (`resolveDynamicModel`) for model ids missing from the per-agent registry.

## Setup commands

- Install deps: `npm install`
- Start dev:    `npm run build` (no dev server — plugin is a runtime entry built to `dist/`)
- Build:        `npm run build` (`tsc -p tsconfig.json`)
- Test:         `npm test` (`vitest run`)
- Typecheck:    `npm run typecheck` (`tsc --noEmit`)

## Project layout

- `index.ts` — plugin entry: registers the `commandcode` provider, live/static catalogs, dynamic resolution, transport mapping
- `src/` — provider logic; `baseline.models.ts` is generated, never hand-edited
- `test/` — Vitest unit tests (transport + projection + dynamic resolution)
- `scripts/` — Node `.mjs` utilities (`generate-baseline.mjs`, `smoke.discovery.mjs`, `live-test.mjs`)
- `.github/workflows/` — CI (typecheck + build + tests)
- `dist/` — build output, git-ignored

## Code style

- TypeScript strict mode (`tsconfig.json`: `strict: true`), `module`/`moduleResolution` NodeNext, `target` ES2022
- ESM (`"type": "module"`); scripts are `.mjs`, no `.d.ts` is shipped intentionally
- No linter/formatter configured — match surrounding code style manually

## Testing instructions

- Unit tests: `npm test` (Vitest, `test/modelMapping.test.ts`)
- Discovery smoke: `node scripts/smoke.discovery.mjs` (hits the live public endpoint)
- Live inference: `node scripts/live-test.mjs` (reads the key from `~/.openclaw/secrets/providers.json`, never prints it)
- Baseline refresh: `node scripts/generate-baseline.mjs` (rewrites `src/baseline.models.ts` **and** the `modelCatalog` block of `openclaw.plugin.json` from the same projection as `projectModel` in `index.ts` — keep the two in sync)
- Add tests for every new behavior; all tests must pass before opening a PR

## PR & commit conventions

- Branch from `main`; never push to it directly
- Commit message: conventional commits (`feat:` / `fix:` / `docs:` / `refactor:`)
- Open PR once CI (`typecheck` + `build` + `test`) is green

## Security

- Never commit secrets — `.env` and `.env.*` are in `.gitignore`
- The API key is read from the `COMMAND_CODE_API_KEY` env var (or the user's auth profile / provider config) only; never hardcode it

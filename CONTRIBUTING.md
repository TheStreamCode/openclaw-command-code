# Contributing to openclaw-command-code

Thanks for your interest in improving this project! Bug reports, fixes, docs,
and tests are all welcome.

## Development setup

```bash
npm ci
npm run typecheck
npm run build
npm test
```

CI repeats the same gate and additionally rejects the build when the committed
`dist/` output is stale — run `npm run build` and commit the refreshed `dist/`
before pushing.

## Regenerating the model baseline

`src/baseline.models.ts` and the manifest catalog are generated from a single
projection:

```bash
node scripts/generate-baseline.mjs
```

Commit the regenerated files together so the baseline, the manifest, and
`dist/` stay in sync.

## Pull requests

- Keep changes focused; one concern per PR.
- Add or update tests (`vitest`) for behavior changes.
- Never commit API keys, tokens, or account data.

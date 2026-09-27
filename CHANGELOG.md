# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-09-27

### Changed

- Refreshed static model baseline 56 → 82 models from the live
  `/models` endpoint (adds DeepSeek V4.1 Flash, GPT-6 family, Grok 4.7,
  Qwen 3.8-Flash/Omni, Kimi/MiMo/GLM updates, and others; no removals).
  Manifest `modelCatalog` regenerated in sync. Reported in #11.
- Build metadata now records openclaw 2026.9.5 (previously 2026.7.1),
  matching the tested SDK.

## [0.1.0] - 2026-08-21

### Added

- Initial release: Command Code (`commandcode.ai`) model-provider plugin for
  OpenClaw with three-tier model resolution (generated static baseline, live
  catalog, dynamic resolver).

# Security Policy

## Supported versions

Security fixes target the latest published release and the current `main` branch.

## Reporting a vulnerability

This plugin handles API keys at inference time. Report security issues privately:
use GitHub's **private vulnerability reporting** (Security Advisories) on this
repository. If that route is unavailable, email `info@mikesoft.it` with the
subject `openclaw-command-code Security Report`. Do not open a public issue for
sensitive findings.

## Credential handling

The Command Code API key belongs in the environment or your auth profile
(`COMMAND_CODE_API_KEY`). Never commit keys, tokens, or account data to this
repository, and never paste real credentials into issues, pull requests, or
test fixtures.

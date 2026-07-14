# Product

**kiro-action** is the official GitHub Action for [Kiro](https://kiro.dev) — AWS's AI-powered agentic IDE and CLI. It runs Kiro's [headless mode](https://kiro.dev/docs/cli/headless) inside GitHub workflows so Kiro can read repository context, write code, and open pull requests automatically.

## What it does

Users invoke Kiro from GitHub in one of four ways:

- **comment** — `/kiro <instruction>` on any issue or PR for ad-hoc requests
- **label** — adding a `kiro` label to an issue or PR ("this issue describes the work, go do it")
- **assign** — assigning an issue or PR to the `kirocli` user
- **auto** — an explicit `prompt:` input on a scheduled or push workflow (PR review, dependency audits, doc sync, CI auto-fix, etc.)

Detection priority is `auto` > `comment` > `label` > `assign`. Comment and label modes verify the triggering user has write access before running.

## Key facts

- Distributed via the GitHub Marketplace; consumers reference it as `kirodotdev-labs/kiro-action@v0`.
- Authenticates with a `KIRO_API_KEY` repo secret (requires a Kiro Pro/Pro+/Power subscription). The key is passed to the CLI via environment variable and is never logged or exposed to the prompt.
- The `examples/` directory ships ready-to-use workflow templates for common automation patterns.
- Licensed under Apache 2.0.

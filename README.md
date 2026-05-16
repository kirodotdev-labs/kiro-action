# kiro-action

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-kiro--action-blue?logo=github)](https://github.com/marketplace/actions/kiro-action)
[![Release](https://img.shields.io/github/v/release/karancode/kiro-action?logo=github)](https://github.com/karancode/kiro-action/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/karancode/kiro-action/actions/workflows/ci.yml/badge.svg)](https://github.com/karancode/kiro-action/actions/workflows/ci.yml)

A GitHub Action that runs [Kiro](https://kiro.dev) — AWS's agentic IDE and command-line interface — on your pull requests, issues, and schedules. Mention `/kiro` in a comment, assign an issue to the `kiro` user, or run it from a workflow with an explicit prompt. Kiro reads the context, writes the code, and opens a pull request.

It's [headless mode](https://kiro.dev/docs/cli/headless), wired up to GitHub.

## What you can do with it

- **Comment on a PR or issue** — `/kiro fix the null deref in src/auth/login.ts` and Kiro pushes a fix
- **Assign an issue** to `kiro` — Kiro reads the body, implements it, opens a PR
- **Run on a schedule** — weekly dependency upgrades, drift checks, doc sync, whatever you wire up
- **Wrap it in a custom prompt** — security review on every PR, auto-fix CI failures, triage new issues

The [`examples/`](examples/) directory has nine ready-to-drop-in workflows.

## Quickstart

**1.** Add `KIRO_API_KEY` as a repo secret (Settings → Secrets and variables → Actions).

**2.** Drop a workflow file into `.github/workflows/`:

```yaml
name: Kiro

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [assigned]
  pull_request:
    types: [assigned]

jobs:
  kiro:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      issues: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: karancode/kiro-action@v0
        with:
          kiro_api_key: ${{ secrets.KIRO_API_KEY }}
```

**3.** Comment `/kiro <anything>` on an issue or PR.

That's it. For other patterns, copy a file from [`examples/`](examples/).

## Examples

| File | What it does |
|---|---|
| [`kiro.yml`](examples/kiro.yml) | The default — `/kiro` mentions and `kiro` assignments |
| [`pr-review.yml`](examples/pr-review.yml) | Comprehensive review on every PR |
| [`security-review.yml`](examples/security-review.yml) | OWASP-style review on sensitive paths only |
| [`external-contributor-review.yml`](examples/external-contributor-review.yml) | Strict review for non-team PRs |
| [`issue-triage.yml`](examples/issue-triage.yml) | Auto-label new issues, request missing info |
| [`docs-sync.yml`](examples/docs-sync.yml) | Keep docs in sync with code changes |
| [`dependency-audit.yml`](examples/dependency-audit.yml) | Weekly dependency upgrade PR |
| [`ci-failure-fix.yml`](examples/ci-failure-fix.yml) | Auto-fix failing CI on PR branches |
| [`code-reviewer-agent.yml`](examples/code-reviewer-agent.yml) | Use a custom Kiro agent for review |

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `kiro_api_key` | yes | — | Kiro API key. Pass via secret. |
| `github_token` | no | `github.token` | Token used for GitHub API calls. |
| `prompt` | no | — | Explicit prompt for scheduled / push triggers. |
| `trigger_phrase` | no | `/kiro` | Phrase that activates Kiro from comments. |
| `assignee_trigger` | no | `kiro` | GitHub username whose assignment activates Kiro. |
| `branch_prefix` | no | `kiro/` | Prefix for branches Kiro creates. |
| `kiro_args` | no | `--trust-all-tools` | Extra flags passed through to `kiro-cli chat`. See [`kiro-cli chat --help`](https://kiro.dev/docs/cli/headless) for the full list. |

## Outputs

| Output | Description |
|---|---|
| `branch_name` | Branch Kiro pushed to (when changes were made). |
| `pr_url` | URL of the PR Kiro opened (when one was opened). |
| `kiro_output` | Cleaned output from the Kiro CLI. |

## Permissions

Comment and assign modes need write access to commit and open PRs:

```yaml
permissions:
  contents: write       # push branches
  issues: write         # post / update progress comments
  pull-requests: write  # open PRs
```

For pure review or triage workflows (no commits), `contents: read` is enough — see the individual examples for the minimal permission set each one needs.

## How triggers work

| Mode | Activates on | Behavior |
|---|---|---|
| **comment** | `issue_comment` or `pull_request_review_comment` containing the trigger phrase | Only repo collaborators with write access can trigger. Kiro posts a sticky progress comment, then updates it with the result. |
| **assign** | `issues.assigned` or `pull_request.assigned` to the assignee user | Reads issue / PR body as the task. |
| **auto** | Any event where `prompt:` is set on the action | Skips trigger detection — runs the prompt directly. |

A repo can use any combination of these. They don't conflict.

## Authentication

Set `KIRO_API_KEY` to a Kiro API key from your account at [kiro.dev](https://kiro.dev). The action passes it to `kiro-cli` via environment variable — it's never logged or exposed to the prompt.

AWS IAM / SIGV4 authentication is on the roadmap upstream ([kirodotdev/kiro#5938](https://github.com/kirodotdev/kiro/issues/5938)) — once that lands, the action will support it without long-lived keys.

## Development

```bash
bun install        # deps
bun run typecheck  # tsc --noEmit
bun test           # unit tests
bun run build      # bundle to dist/index.js
```

The bundled `dist/index.js` is committed and is what GitHub runs. Source lives in `src/`. See [CLAUDE.md](CLAUDE.md) for the architecture.

## License

MIT.

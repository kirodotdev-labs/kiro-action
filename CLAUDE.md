# kiro-action

GitHub Action that runs [Kiro](https://kiro.dev) — AWS's agentic IDE and command-line interface — in CI. Handles `/kiro` comment triggers, issue/PR labels, assignment, and explicit prompt automation.

## Trigger modes

- **comment** — `/kiro <instruction>` in any PR or issue comment
- **label** — Issue or PR labeled with `kiro` (or whatever `label_trigger` is set to)
- **assign** — Issue or PR assigned to `kirocli` (or whatever `assignee_trigger` is set to)
- **auto** — Explicit `prompt:` input on a scheduled or push workflow

Detection priority: `auto` > `comment` > `label` > `assign`. `label` and `assign` share one handler (`issue-mode.ts`).

## Stack

- TypeScript + Bun
- Build: `bun build src/index.ts --outfile dist/index.js` (`dist/` is committed)
- Tests: `bun test` (files in `tests/`)
- GitHub API: `@actions/github` + `@octokit/rest`

## Key files

```
src/
  index.ts                 # Entry point — reads inputs, detects mode, dispatches
  setup/install-kiro.ts    # Installs Kiro CLI via official install script, caches by version
  github/
    context.ts             # Parses GitHub event payload into typed GithubContext
    comment.ts             # Sticky progress comment (post + update)
    pr.ts                  # Branch creation, commit, PR open
  modes/
    detect.ts              # Determines mode from event + inputs
    comment-mode.ts        # Handles /kiro comment trigger
    issue-mode.ts          # Handles label + assignment triggers (shared)
    auto-mode.ts           # Handles explicit prompt: input
  prompt/build-prompt.ts   # Builds context-rich prompt for Kiro
  kiro/runner.ts           # Spawns kiro-cli chat --no-interactive --v3, returns cleaned stdout
  utils/
    auth.ts                # Validates KIRO_API_KEY
    ansi.ts                # Strips ANSI escape codes (workaround for kirodotdev/kiro#7929)
    extract-output.ts      # Pulls the structured summary + PR title out of kiro-cli output
```

## CLI installation

Kiro CLI is installed via the official script at `https://cli.kiro.dev/install`, called with `--force --no-modify-path` (and `--version <x.y.z>` when `kiro_version` is pinned). For `latest`, the version is resolved from `https://prod.download.cli.kiro.dev/stable/latest/manifest.json` — that manifest exists only for the latest release. The version is the cache key. The binary is `kiro-cli`, installed to `~/.local/bin/`. Some events (e.g. `issue_comment`) get a read-only cache token, so the cache is saved by push, schedule or dispatch runs on the default branch.

## Kiro CLI engine

Kiro CLI 3.x ships two agent engines. A headless run with no engine flag picks V2, except that `--trust-all-tools` switches it to V3. The action supports V3 only: the runner always passes `--v3`, unless `kiro_args` already names an engine (`--v2`, `--v3`, `--agent-engine`), so it never sends conflicting flags. Kiro's reply goes to stdout; stderr (V3 engine logs, V2 tool progress) is included in the output only when the run fails.

## Commands

```bash
bun install          # Install dependencies
bun run typecheck    # Type-check without emitting
bun test             # Run unit tests
bun run build        # Bundle to dist/index.js
bun run format       # Format source files
```

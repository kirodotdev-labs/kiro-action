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
  kiro/runner.ts           # Spawns kiro-cli chat --no-interactive, returns cleaned output
  utils/
    auth.ts                # Validates KIRO_API_KEY
    ansi.ts                # Strips ANSI escape codes (workaround for kirodotdev/kiro#7929)
    extract-output.ts      # Pulls the structured summary + PR title out of kiro-cli output
```

## CLI installation

Kiro CLI is installed via the official script at `https://cli.kiro.dev/install`. Version is resolved at runtime from `https://prod.download.cli.kiro.dev/stable/latest/manifest.json` for cache keying. The binary is `kiro-cli`, installed to `~/.local/bin/`.

The direct binary CDN returns 403 for non-script downloads, so `curl | bash` is currently the only supported install path. The manifest is used for version metadata only.

## Commands

```bash
bun install          # Install dependencies
bun run typecheck    # Type-check without emitting
bun test             # Run unit tests
bun run build        # Bundle to dist/index.js
bun run format       # Format source files
```

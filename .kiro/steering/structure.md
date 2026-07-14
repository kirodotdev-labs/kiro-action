# Project Structure

## Top level

```
action.yml          # Action metadata: inputs, outputs, node24 entry point
package.json         # Scripts and dependencies
tsconfig.json        # Strict TS config; compiles src/ only
dist/index.js        # Committed bundled output — what GitHub actually runs
src/                 # Source (TypeScript)
tests/               # Unit tests (bun test)
examples/            # Drop-in workflow templates for consumers
assets/              # README images and branding
.github/workflows/   # CI and release pipelines for this repo
README.md            # User-facing docs
CLAUDE.md            # Architecture notes
```

## Source layout (`src/`)

```
src/
  index.ts                 # Entry point — reads inputs, detects mode, dispatches
  setup/
    install-kiro.ts        # Installs Kiro CLI via official script, caches by version
  github/
    context.ts             # Parses the GitHub event payload into a typed GithubContext
    comment.ts             # Sticky progress comment (post + update)
    pr.ts                  # Branch creation, commit, PR open
  modes/
    detect.ts              # Determines trigger mode from event + inputs
    comment-mode.ts        # Handles the /kiro comment trigger
    issue-mode.ts          # Handles label + assignment triggers (shared handler)
    auto-mode.ts           # Handles the explicit prompt: input
  prompt/
    build-prompt.ts        # Builds the context-rich prompt passed to Kiro
  kiro/
    runner.ts              # Spawns kiro-cli chat --no-interactive, returns cleaned output
  utils/
    auth.ts                # Validates KIRO_API_KEY
    ansi.ts                # Strips ANSI escape codes from CLI output
    extract-output.ts      # Extracts the structured summary + PR title from CLI output
```

## Organizing principles

- Code is grouped by responsibility: `setup/` (install), `github/` (API side effects), `modes/` (trigger handlers), `prompt/` (prompt assembly), `kiro/` (CLI invocation), `utils/` (pure helpers).
- Each trigger mode has its own file in `modes/`; `label` and `assign` share `issue-mode.ts`. Add new modes here and wire dispatch in `index.ts` + detection in `modes/detect.ts`.
- Tests in `tests/` cover the core modules and are named after them (e.g. `context.test.ts` ↔ `github/context.ts`, `runner.test.ts` ↔ `kiro/runner.ts`; note `detect.ts` ↔ `detect-mode.test.ts`). Add a matching test file when adding a module.
- New consumer-facing usage patterns belong in `examples/` as standalone workflow YAML files, and should be listed in the README examples table.

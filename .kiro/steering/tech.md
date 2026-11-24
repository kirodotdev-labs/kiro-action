# Tech Stack

## Language & runtime

- **TypeScript** (strict mode), targeting **ES2022** with `NodeNext` module resolution.
- **Bun** is the package manager, test runner, and bundler.
- The action runs on the GitHub Actions **node24** runtime (`action.yml` → `runs.using: node24`).

## Libraries

- `@actions/core`, `@actions/exec`, `@actions/cache`, `@actions/tool-cache` — GitHub Actions toolkit.
- `@actions/github` + `@octokit/rest` — GitHub API access.
- `prettier` — code formatting (dev).

## Build model

- Source lives in `src/`; the entry point is `src/index.ts`.
- The build bundles everything into a single **minified `dist/index.js`**, which is **committed to the repo** — GitHub runs the bundled output, not the source. Always rebuild and commit `dist/` when changing `src/`.
- The Kiro CLI itself is installed at runtime via the official script (`https://cli.kiro.dev/install`); the binary is `kiro-cli`, installed to `~/.local/bin/`. The version comes from the `kiro_version` input (`latest` resolves via the stable manifest) and is used as the cache key; the script is called with `--force --no-modify-path` plus `--version` when pinned. Every run passes `--v3` unless `kiro_args` names an engine (`--v2`, `--v3`, `--agent-engine`).

## Common commands

```bash
bun install          # Install dependencies
bun run typecheck    # Type-check only (tsc --noEmit)
bun test             # Run unit tests (files in tests/)
bun run build        # Bundle + minify to dist/index.js
bun run format       # Format src/ and tests/ with Prettier
bun run format:check # Verify formatting without writing
```

## Conventions

- Keep code strict-null-safe; the compiler runs with `strict: true`.
- Run `bun run typecheck`, `bun test`, and `bun run build` before committing changes to `src/`.
- Never log or echo the `KIRO_API_KEY` — pass it only via environment variable.

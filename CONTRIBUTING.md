# Contributing

Thanks for your interest in contributing to opencode-session-handoff!

## Development Setup

```bash
git clone https://github.com/bristena-op/opencode-session-handoff.git
cd opencode-session-handoff
bun install
```

## Commands

| Command          | Description                                    |
| ---------------- | ---------------------------------------------- |
| `bun run build`  | Build the plugin                               |
| `bun run test`   | Run tests                                      |
| `bun run check`  | Run all checks (format, lint, typecheck, test) |
| `bun run format` | Format code with oxfmt                         |
| `bun run lint`   | Lint with oxlint                               |

## Local Development

To test your changes locally, add the plugin path to your `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["./plugins/opencode-handoff"]
}
```

Then restart OpenCode to load the plugin from your local directory.

## Code Style

- We use [oxfmt](https://oxc.rs/docs/guide/usage/formatter.html) for formatting
- We use [oxlint](https://oxc.rs/docs/guide/usage/linter.html) for linting
- Max function complexity is 10 (enforced by oxlint)
- No `as any`, `@ts-ignore`, or `@ts-expect-error`

## Pull Requests

1. Create a branch from `main`
2. Make your changes
3. Run `bun run check` to ensure all checks pass
4. Open a PR with a clear description

## Project Structure

```
├── index.ts        # Main plugin entry, tool definitions
├── prompt.ts       # Handoff prompt builder
├── auto-update.ts  # Auto-update hook
├── index.test.ts   # Tests
└── dist/           # Built output (generated)
```

## Releasing

Releases are automated via GitHub Actions when a tag is pushed:

```bash
git tag v1.x.x
git push origin v1.x.x
```

The workflow will build, test, and publish to npm.

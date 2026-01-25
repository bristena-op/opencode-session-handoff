# opencode-session-handoff

An OpenCode plugin for seamless session continuation when context windows fill up.

## Installation

Add to your `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["opencode-session-handoff"]
}
```

Then restart OpenCode. The plugin will auto-update when new versions are released.

## What it does

When your OpenCode session gets too long, use `session_handoff` to:

1. Create a new session titled "Handoff: {previous title}"
2. Transfer a compact continuation prompt (~100-200 tokens)
3. Preserve your agent mode and model settings
4. Open the session picker so you can switch to it

## Tools

### `session_handoff`

Creates a new session with continuation context.

**Usage:** Say "handoff" or "session handoff"

**Arguments (provided by the assistant):**
- `summary` (required): 1-3 sentence summary of current state
- `next_steps` (optional): Remaining tasks
- `blocked` (optional): Current blocker
- `key_decisions` (optional): Important decisions made
- `files_modified` (optional): Key files changed

**Auto-fetched:**
- Todo list status (completed/in-progress/pending)
- Agent mode (e.g., Sisyphus, build, plan)
- Model configuration (provider + model ID)

### `read_session`

Reads messages from the previous session for additional context.

**Usage:** In a handoff session, ask to "read the previous session" if you need more details.

Use sparingly—fetches the last 20 messages which uses significant tokens.

## Auto-Update

The plugin checks for updates on every new session. When a new version is available:

1. Updates your `opencode.json` config
2. Invalidates the cached package
3. Runs `bun install`
4. Shows a toast notification

Restart OpenCode to apply updates.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## How it works

1. Agent provides a summary of current work
2. Plugin fetches todo list and model config from current session
3. Builds a compact handoff prompt
4. Creates new session via `session.create`
5. Sends the prompt via `session.promptAsync`
6. Opens session picker via `tui.openSessions`

Inspired by [Amp's handoff feature](https://ampcode.com/news/handoff).

## License

MIT

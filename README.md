# opencode-handoff

An OpenCode plugin for seamless session continuation when context windows fill up.

## What it does

When your OpenCode session gets too long, use `session_handoff` to:

1. Automatically gather context from the current session (todos, agent, model)
2. Create a new session titled "Handoff: {previous title}"
3. Send a compact continuation prompt to the new session
4. Open the session picker so you can switch to it

The new session starts with full context of what you were working on, preserving your agent (Sisyphus/build/plan) and model settings.

## Installation

The plugin is installed at `~/.config/opencode/plugins/opencode-handoff/`.

Add it to your `opencode.json`:

```json
{
  "plugins": ["./plugins/opencode-handoff"]
}
```

## Tools

### `session_handoff`

Creates a new session with continuation context from the current session.

**Usage:** Ask the assistant to "session handoff" or "use session_handoff"

**What gets transferred:**

- Session title
- Todo list status (completed/in-progress/pending)
- Agent mode (e.g., Sisyphus, build, plan)
- Model configuration (provider + model ID)
- Reference to previous session ID

### `read_session`

Reads messages from the current session for additional context.

**Usage:** In a handoff session, ask to "read the previous session" if you need more details about what was discussed.

## Configuration

Optional config file at `~/.config/opencode/handoff.json`:

```json
{
  "auto_handoff_threshold": 80,
  "enabled": true
}
```

## Development

```bash
cd ~/.config/opencode/plugins/opencode-handoff
bun install
bun build index.ts --outdir dist --format esm
```

## How it works

1. Fetches current session info via OpenCode's API
2. Extracts the last assistant message to get agent/model config
3. Retrieves todo list state
4. Builds a compact handoff prompt (~200-400 tokens)
5. Creates new session via `session.create`
6. Sends the prompt via `session.promptAsync`
7. Opens session picker via `tui.openSessions`

## Note

This plugin uses `session_handoff` (not `handoff`) to avoid collision with OpenCode's built-in handoff behavior.

# Introducing opencode-session-handoff: Seamless Context Continuity for OpenCode

**TL;DR:** When your OpenCode session fills up, say "session handoff" and the AI creates a new session with everything it needs to continue - your todos, agent config, model settings, and a compact summary. No copy-paste. No lost context.

---

## The Problem

You're deep into a coding session with OpenCode. Three hours in, you've made progress - refactored the auth module, fixed that race condition, updated tests. Your todo list is half-done.

Then you hit the context window limit.

OpenCode's built-in handoff writes a markdown summary to disk. But then what? You manually copy it into a new session? Hope the AI figures out where you left off?

Context handoffs shouldn't require manual intervention.

## The Solution

`opencode-session-handoff` is an OpenCode plugin that automates the entire handoff process:

```bash
# Install
npm install opencode-session-handoff
```

Add to your `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["opencode-session-handoff"]
}
```

That's it. When you're running low on context, just say:

> "session handoff"

The plugin:

1. **Gathers context** - Fetches your todo list, current agent (Sisyphus, build, plan), and model config
2. **Asks for a summary** - The AI provides a 1-3 sentence summary of current state
3. **Creates a new session** - Titled "Handoff: {your previous title}"
4. **Sends the continuation prompt** - Compact (~100-200 tokens), containing everything needed
5. **Opens the session picker** - So you can switch immediately

The new session starts with your same agent and model. It knows what you were doing, what's blocked, and what's next.

## What Gets Transferred

The handoff prompt is deliberately minimal:

```
## Session Handoff

Building auth flow for the user dashboard. Login works,
session persistence implemented, currently fixing token refresh.

**Todos:** 3/5 done
- In progress: Fix token refresh race condition
- Pending: Add logout endpoint, Write integration tests

**Files:** src/auth/session.ts, src/api/routes.ts

**Next:** 1. Add mutex for token refresh 2. Test concurrent requests

---
Previous: `ses_abc123` · Use `read_session` if you need more context.
```

No bloat. No dumping the entire conversation. Just what's needed to continue.

## The `read_session` Escape Hatch

Sometimes the summary isn't enough. Maybe you need to recall a specific decision or check what error message you saw earlier.

The new session has access to `read_session`, which fetches the last 20 messages from the previous session. Use it sparingly - it's there when you need it.

## Design Decisions

**Why require an AI-provided summary?**

Earlier versions auto-generated summaries from session titles and todos. But the AI knows context that metadata doesn't capture - the subtle bug you're chasing, the approach you decided against, the user's preferences mentioned in passing.

Requiring the AI to summarize forces it to distill what actually matters.

**Why `session_handoff` instead of `handoff`?**

Some setups have a built-in `handoff` command. Our plugin uses `session_handoff` to avoid collision.

| Feature          | Built-in `handoff`                    | `session_handoff`                     |
| ---------------- | ------------------------------------- | ------------------------------------- |
| **Output**       | Writes `.opencode-handoff.md` to disk | Creates a new live session            |
| **Continuation** | Manual - copy/paste the file contents | Automatic - new session ready to go   |
| **Agent/Model**  | Not preserved                         | Preserves your agent and model config |
| **Todos**        | Not included                          | Fetches and transfers todo state      |
| **User action**  | Read file, start new session, paste   | Just switch to the new session        |

Our plugin automates what would otherwise be a manual multi-step process.

**Why open the session picker instead of auto-switching?**

OpenCode's TUI API lets us open the picker but not force a switch. This turned out to be a feature - you see the new session created and consciously switch to it.

## Technical Details

Built with the `@opencode-ai/plugin` SDK. The plugin:

- Uses `session.get` to fetch current session title
- Uses `session.messages` to extract agent/model from the last assistant message
- Uses `session.todo` to get todo list state
- Creates the new session via `session.create`
- Sends the handoff prompt via `session.promptAsync`
- Opens the picker via `tui.openSessions`

All API calls run in parallel where possible for fast handoffs.

## Try It

```bash
npm install opencode-session-handoff
```

Add `"opencode-session-handoff"` to your plugins array. Restart OpenCode.

Next time you're running low on context: "session handoff"

---

**Links:**

- [GitHub](https://github.com/bristena-op/opencode-session-handoff)
- [npm](https://www.npmjs.com/package/opencode-session-handoff)

MIT License. PRs welcome.

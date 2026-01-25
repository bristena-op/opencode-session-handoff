import type { Plugin, ToolDefinition } from "@opencode-ai/plugin";
import { z } from "zod";

interface Message {
  role: string;
  providerID?: string;
  modelID?: string;
  mode?: string;
  parts?: Array<{ type: string; text?: string }>;
}

interface PluginClient {
  session: {
    get: (params: { path: { id: string }; query: { directory: string } }) => Promise<{
      data?: { title?: string };
    }>;
    messages: (params: { path: { id: string }; query: { directory: string } }) => Promise<{
      data?: Message[];
    }>;
    todo: (params: { path: { id: string }; query: { directory: string } }) => Promise<{
      data?: Array<{ content: string; status: string }>;
    }>;
    create: (params: { query: { directory: string }; body: { title: string } }) => Promise<{
      data?: { id?: string };
    }>;
    promptAsync: (params: {
      path: { id: string };
      query: { directory: string };
      body: {
        model?: { providerID: string; modelID: string };
        agent?: string;
        parts: Array<{ type: string; text: string }>;
      };
    }) => Promise<void>;
  };
  tui: {
    openSessions: (params: { query: { directory: string } }) => Promise<void>;
  };
}

interface PluginContext {
  directory: string;
  client: PluginClient;
  serverUrl: URL;
}

function buildHandoffPrompt(args: {
  previousSessionId: string;
  task: string;
  blocked: string;
  modified_files: string[];
  reference_files: string[];
  decisions: Array<{ decision: string; reason: string }>;
  tried_failed: Array<{ approach: string; why_failed: string }>;
  next_steps: string[];
  user_prefs: string[];
  todos?: Array<{ content: string; status: string }>;
}): string {
  const {
    previousSessionId,
    task,
    blocked,
    modified_files,
    reference_files,
    decisions,
    tried_failed,
    next_steps,
    user_prefs,
    todos,
  } = args;

  const lines: string[] = ["## Handoff Continuation Prompt"];
  lines.push("");
  lines.push("### Task");
  lines.push(task || "Continue previous work");

  if (blocked && blocked !== "none") {
    lines.push("");
    lines.push("### Blocked");
    lines.push(blocked);
  }

  if (todos && todos.length > 0) {
    const completed = todos.filter((t) => t.status === "completed").length;
    const inProgress = todos.filter((t) => t.status === "in_progress");
    const pending = todos.filter((t) => t.status === "pending");
    lines.push("");
    lines.push("### Todos");
    lines.push(`${completed}/${todos.length} complete`);
    if (inProgress.length > 0) {
      lines.push(`In progress: ${inProgress.map((t) => t.content).join(", ")}`);
    }
    if (pending.length > 0) {
      lines.push(`Pending: ${pending.map((t) => t.content).join(", ")}`);
    }
  }

  if (modified_files.length > 0 || reference_files.length > 0) {
    lines.push("");
    lines.push("### Files");
    if (modified_files.length > 0) {
      lines.push(`Modified: ${modified_files.join(", ")}`);
    }
    if (reference_files.length > 0) {
      lines.push(`Reference: ${reference_files.join(", ")}`);
    }
  }

  if (decisions.length > 0) {
    lines.push("");
    lines.push("### Decisions Made");
    for (const d of decisions) {
      lines.push(`- ${d.decision}: ${d.reason}`);
    }
  }

  if (tried_failed.length > 0) {
    lines.push("");
    lines.push("### Tried & Failed");
    for (const t of tried_failed) {
      lines.push(`- ${t.approach}: ${t.why_failed}`);
    }
  }

  if (next_steps.length > 0) {
    lines.push("");
    lines.push("### Next Steps");
    next_steps.forEach((step, i) => {
      lines.push(`${i + 1}. ${step}`);
    });
  }

  if (user_prefs.length > 0) {
    lines.push("");
    lines.push("### User Preferences");
    for (const pref of user_prefs) {
      lines.push(`- ${pref}`);
    }
  }

  lines.push("");
  lines.push("---");
  lines.push(
    `Continuing from session \`${previousSessionId}\`. Use \`read_session\` tool if you need additional context.`,
  );

  return lines.join("\n");
}

function createHandoffTool(pluginCtx: PluginContext): ToolDefinition {
  return {
    description: `Generate a minimal continuation prompt and start a new session with it.

When called, this tool:
1. Reads current todo state
2. Generates a compact handoff prompt (~200-400 tokens)
3. Creates a new session with that prompt
4. Returns the new session ID

Use this when the user says "handoff" or "session handoff" to seamlessly continue work in a fresh context window.`,
    parameters: z.object({}),
    async execute(_args, ctx) {
      let todos: Array<{ content: string; status: string }> | undefined;
      let previousTitle = "Unknown";
      let modelConfig: { providerID: string; modelID: string } | undefined;
      let agent: string | undefined;

      if (ctx.sessionID) {
        try {
          const sessionInfo = await pluginCtx.client.session.get({
            path: { id: ctx.sessionID },
            query: { directory: pluginCtx.directory },
          });
          if (sessionInfo?.data?.title) {
            previousTitle = sessionInfo.data.title;
          }
        } catch (_error: unknown) {
          /* Session info fetch failed - continue with defaults */
        }

        try {
          const messagesResult = await pluginCtx.client.session.messages({
            path: { id: ctx.sessionID },
            query: { directory: pluginCtx.directory },
          });
          if (messagesResult?.data && Array.isArray(messagesResult.data)) {
            const assistantMessages = messagesResult.data.filter(
              (m: Message) => m.role === "assistant",
            );
            const lastAssistant = assistantMessages[assistantMessages.length - 1];
            if (lastAssistant?.providerID && lastAssistant?.modelID) {
              modelConfig = {
                providerID: lastAssistant.providerID,
                modelID: lastAssistant.modelID,
              };
            }
            if (lastAssistant?.mode) {
              agent = lastAssistant.mode;
            }
          }
        } catch (_error: unknown) {
          /* Messages fetch failed - continue without model config */
        }

        try {
          const todoResult = await pluginCtx.client.session.todo({
            path: { id: ctx.sessionID },
            query: { directory: pluginCtx.directory },
          });
          if (todoResult.data && Array.isArray(todoResult.data)) {
            todos = todoResult.data;
          }
        } catch (_error: unknown) {
          /* Todo fetch failed - continue without todos */
        }
      }

      const handoffPrompt = buildHandoffPrompt({
        previousSessionId: ctx.sessionID,
        task: previousTitle,
        blocked: "",
        modified_files: [],
        reference_files: [],
        decisions: [],
        tried_failed: [],
        next_steps: [],
        user_prefs: [],
        todos,
      });

      const newTitle = `Handoff: ${previousTitle}`;

      const newSession = await pluginCtx.client.session.create({
        query: { directory: pluginCtx.directory },
        body: { title: newTitle },
      });

      const sessionId = newSession?.data?.id;
      if (!sessionId) {
        return `Failed to create session`;
      }

      await pluginCtx.client.session.promptAsync({
        path: { id: sessionId },
        query: { directory: pluginCtx.directory },
        body: {
          model: modelConfig,
          agent: agent,
          parts: [{ type: "text", text: handoffPrompt }],
        },
      });

      await pluginCtx.client.tui.openSessions({
        query: { directory: pluginCtx.directory },
      });

      return `✓ Session "${newTitle}" created (${agent || "default"} · ${modelConfig ? `${modelConfig.providerID}/${modelConfig.modelID}` : "default model"}). Select it from the picker.`;
    },
  };
}

function createReadSessionTool(pluginCtx: {
  directory: string;
  client: PluginClient;
}): ToolDefinition {
  return {
    description: `Read messages from a previous session to get additional context.

Use this when you're in a handoff session and need more details about what was discussed or decided in the previous session.`,
    parameters: z.object({}),
    async execute(_args, ctx) {
      if (!ctx.sessionID) {
        return "No session ID available";
      }

      try {
        const messagesResult = await pluginCtx.client.session.messages({
          path: { id: ctx.sessionID },
          query: { directory: pluginCtx.directory },
        });

        if (!messagesResult?.data || !Array.isArray(messagesResult.data)) {
          return `No messages found`;
        }

        const messages = messagesResult.data.slice(-20);
        const formatted = messages.map((msg: Message) => {
          const role = msg.role || "unknown";
          const content =
            msg.parts
              ?.filter((p) => p.type === "text")
              .map((p) => p.text || "")
              .join("\n") || "[no text content]";
          return `[${role}]: ${content.slice(0, 2000)}${content.length > 2000 ? "..." : ""}`;
        });

        return `Messages (last ${messages.length}):\n\n${formatted.join("\n\n---\n\n")}`;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        return `Failed to read session: ${errorMsg}`;
      }
    },
  };
}

const HandoffPlugin: Plugin = async (ctx) => {
  return {
    tool: {
      session_handoff: createHandoffTool({
        directory: ctx.directory,
        client: ctx.client as PluginClient,
        serverUrl: ctx.serverUrl,
      }),
      read_session: createReadSessionTool({
        directory: ctx.directory,
        client: ctx.client as PluginClient,
      }),
    },
  };
};

export default HandoffPlugin;

export { buildHandoffPrompt };

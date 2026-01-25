import type { Plugin, PluginInput } from "@opencode-ai/plugin";
import type { Message, Part } from "@opencode-ai/sdk";
import { buildHandoffPrompt } from "./prompt.ts";

type PluginClient = PluginInput["client"];

interface PluginContext {
  directory: string;
  client: PluginClient;
  serverUrl: URL;
}

interface Todo {
  content: string;
  status: string;
}

interface ModelConfig {
  providerID: string;
  modelID: string;
}

interface SessionContext {
  title: string;
  todos: Todo[];
  modelConfig?: ModelConfig;
  agent?: string;
}

interface MessageWithParts {
  info: Message;
  parts: Part[];
}

async function fetchSessionTitle(
  client: PluginClient,
  sessionId: string,
  directory: string,
): Promise<string> {
  try {
    const result = await client.session.get({ path: { id: sessionId }, query: { directory } });
    return result?.data?.title || "Unknown";
  } catch {
    return "Unknown";
  }
}

function extractModelFromMessage(msg: Message | undefined): {
  modelConfig?: ModelConfig;
  agent?: string;
} {
  if (!msg) return {};
  if (msg.role !== "assistant") return {};
  const out: { modelConfig?: ModelConfig; agent?: string } = {};
  if (msg.providerID && msg.modelID) {
    out.modelConfig = { providerID: msg.providerID, modelID: msg.modelID };
  }
  if (msg.mode) out.agent = msg.mode;
  return out;
}

async function fetchModelConfig(
  client: PluginClient,
  sessionId: string,
  directory: string,
): Promise<{ modelConfig?: ModelConfig; agent?: string }> {
  try {
    const result = await client.session.messages({ path: { id: sessionId }, query: { directory } });
    if (!result?.data || !Array.isArray(result.data)) return {};
    const messages = result.data as MessageWithParts[];
    const assistantMessages = messages.filter((m) => m.info.role === "assistant");
    const lastAssistant = assistantMessages[assistantMessages.length - 1];
    return extractModelFromMessage(lastAssistant?.info);
  } catch {
    return {};
  }
}

async function fetchTodos(
  client: PluginClient,
  sessionId: string,
  directory: string,
): Promise<Todo[]> {
  try {
    const result = await client.session.todo({ path: { id: sessionId }, query: { directory } });
    return Array.isArray(result?.data) ? (result.data as Todo[]) : [];
  } catch {
    return [];
  }
}

async function gatherSessionContext(
  pluginCtx: PluginContext,
  sessionId: string,
): Promise<SessionContext> {
  const [title, modelResult, todos] = await Promise.all([
    fetchSessionTitle(pluginCtx.client, sessionId, pluginCtx.directory),
    fetchModelConfig(pluginCtx.client, sessionId, pluginCtx.directory),
    fetchTodos(pluginCtx.client, sessionId, pluginCtx.directory),
  ]);
  const ctx: SessionContext = { title, todos };
  if (modelResult.modelConfig) ctx.modelConfig = modelResult.modelConfig;
  if (modelResult.agent) ctx.agent = modelResult.agent;
  return ctx;
}

function createHandoffTool(pluginCtx: PluginContext) {
  return {
    description: `Generate a minimal continuation prompt and start a new session with it.

When called, this tool:
1. Reads current todo state
2. Generates a compact handoff prompt (~200-400 tokens)
3. Creates a new session with that prompt
4. Returns the new session ID

Use this when the user says "handoff" or "session handoff" to seamlessly continue work in a fresh context window.`,
    args: {},
    async execute(_args: Record<string, never>, ctx: { sessionID: string }) {
      const context = ctx.sessionID
        ? await gatherSessionContext(pluginCtx, ctx.sessionID)
        : { title: "Unknown", todos: [] };

      const handoffPrompt = buildHandoffPrompt({
        previousSessionId: ctx.sessionID,
        task: context.title,
        blocked: "",
        modified_files: [],
        reference_files: [],
        decisions: [],
        tried_failed: [],
        next_steps: [],
        user_prefs: [],
        ...(context.todos.length > 0 && { todos: context.todos }),
      });

      const newTitle = `Handoff: ${context.title}`;
      const newSession = await pluginCtx.client.session.create({
        query: { directory: pluginCtx.directory },
        body: { title: newTitle },
      });

      const sessionId = newSession?.data?.id;
      if (!sessionId) return "Failed to create session";

      await pluginCtx.client.session.promptAsync({
        path: { id: sessionId },
        query: { directory: pluginCtx.directory },
        body: {
          ...(context.modelConfig && { model: context.modelConfig }),
          ...(context.agent && { agent: context.agent }),
          parts: [{ type: "text", text: handoffPrompt }],
        },
      });

      await pluginCtx.client.tui.openSessions({ query: { directory: pluginCtx.directory } });

      const modelDisplay = context.modelConfig
        ? `${context.modelConfig.providerID}/${context.modelConfig.modelID}`
        : "default model";
      return `✓ Session "${newTitle}" created (${context.agent || "default"} · ${modelDisplay}). Select it from the picker.`;
    },
  };
}

function createReadSessionTool(pluginCtx: { directory: string; client: PluginClient }) {
  return {
    description: `Read messages from a previous session to get additional context.

Use this when you're in a handoff session and need more details about what was discussed or decided in the previous session.`,
    args: {},
    async execute(_args: Record<string, never>, ctx: { sessionID: string }) {
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

        const messages = (messagesResult.data as MessageWithParts[]).slice(-20);
        const formatted = messages.map((msg) => {
          const role = msg.info.role || "unknown";
          const textParts = msg.parts.filter(
            (p): p is Part & { type: "text"; text: string } => p.type === "text",
          );
          const content = textParts.map((p) => p.text || "").join("\n") || "[no text content]";
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
        client: ctx.client,
        serverUrl: ctx.serverUrl,
      }),
      read_session: createReadSessionTool({
        directory: ctx.directory,
        client: ctx.client,
      }),
    },
  };
};

export default HandoffPlugin;

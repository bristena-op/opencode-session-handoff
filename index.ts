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

interface HandoffToolArgs {
  summary: string;
  next_steps?: string[];
  blocked?: string;
  key_decisions?: string[];
  files_modified?: string[];
}

interface CreateSessionParams {
  client: PluginClient;
  directory: string;
  title: string;
  context: SessionContext;
  handoffPrompt: string;
}

async function createAndPromptSession(params: CreateSessionParams): Promise<string | null> {
  const { client, directory, title, context, handoffPrompt } = params;
  const newSession = await client.session.create({ query: { directory }, body: { title } });
  const sessionId = newSession?.data?.id;
  if (!sessionId) return null;

  const body: {
    model?: ModelConfig;
    agent?: string;
    parts: Array<{ type: "text"; text: string }>;
  } = { parts: [{ type: "text" as const, text: handoffPrompt }] };
  if (context.modelConfig) body.model = context.modelConfig;
  if (context.agent) body.agent = context.agent;

  await client.session.promptAsync({ path: { id: sessionId }, query: { directory }, body });
  return sessionId;
}

function buildHandoffArgs(args: HandoffToolArgs, sessionID: string, todos: Todo[]) {
  return {
    previousSessionId: sessionID,
    summary: args.summary,
    blocked: args.blocked || "",
    modified_files: args.files_modified || [],
    reference_files: [] as string[],
    decisions: (args.key_decisions || []).map((d) => ({ decision: d, reason: "" })),
    tried_failed: [] as Array<{ approach: string; why_failed: string }>,
    next_steps: args.next_steps || [],
    user_prefs: [] as string[],
    ...(todos.length > 0 && { todos }),
  };
}

async function executeHandoff(
  pluginCtx: PluginContext,
  args: HandoffToolArgs,
  sessionID: string,
): Promise<string> {
  if (!args.summary?.trim()) {
    return "Error: summary is required. Provide a 1-3 sentence summary of the current state.";
  }

  const context = sessionID
    ? await gatherSessionContext(pluginCtx, sessionID)
    : { title: "Unknown", todos: [] };

  const handoffPrompt = buildHandoffPrompt(buildHandoffArgs(args, sessionID, context.todos));
  const newTitle = `Handoff: ${context.title}`;

  const sessionId = await createAndPromptSession({
    client: pluginCtx.client,
    directory: pluginCtx.directory,
    title: newTitle,
    context,
    handoffPrompt,
  });

  if (!sessionId) return "Failed to create session";

  await pluginCtx.client.tui.openSessions({ query: { directory: pluginCtx.directory } });

  const model = context.modelConfig;
  const modelDisplay = model ? `${model.providerID}/${model.modelID}` : "default model";
  return `✓ Session "${newTitle}" created (${context.agent || "default"} · ${modelDisplay}). Select it from the picker.`;
}

function createHandoffTool(pluginCtx: PluginContext) {
  return {
    description: `Generate a compact continuation prompt and start a new session with it.

When called, this tool:
1. Uses YOUR summary of what was accomplished (required)
2. Auto-fetches todo state from current session
3. Creates a new session with a minimal handoff prompt (~100-200 tokens)
4. Returns the new session ID

IMPORTANT: You MUST provide a concise summary. Do not dump the entire conversation - distill it to essential context only.

Arguments (pass as JSON object):
- summary (required): 1-3 sentence summary of current state
- next_steps (optional): Array of remaining tasks
- blocked (optional): Current blocker if any
- key_decisions (optional): Array of important decisions made
- files_modified (optional): Array of key files changed

The new session will have access to \`read_session\` tool if more context is needed later.`,
    args: {},
    async execute(args: Record<string, unknown>, ctx: { sessionID: string }) {
      return executeHandoff(pluginCtx, args as unknown as HandoffToolArgs, ctx.sessionID);
    },
  };
}

async function executeReadSession(
  pluginCtx: { directory: string; client: PluginClient },
  sessionID: string,
): Promise<string> {
  if (!sessionID) {
    return "No session ID available";
  }

  try {
    const messagesResult = await pluginCtx.client.session.messages({
      path: { id: sessionID },
      query: { directory: pluginCtx.directory },
    });

    if (!messagesResult?.data || !Array.isArray(messagesResult.data)) {
      return "No messages found";
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
}

function createReadSessionTool(pluginCtx: { directory: string; client: PluginClient }) {
  return {
    description: `Read messages from the previous session to get additional context.

USE SPARINGLY - only when:
- User explicitly asks to "load more context" or "read previous session"
- You encounter something from the handoff that needs clarification
- You need specific details not captured in the handoff summary

This tool fetches the last 20 messages which uses significant tokens. The handoff summary should be sufficient for most continuations.`,
    args: {},
    async execute(_args: Record<string, unknown>, ctx: { sessionID: string }) {
      return executeReadSession(pluginCtx, ctx.sessionID);
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

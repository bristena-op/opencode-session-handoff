import type { Plugin, ToolDefinition } from "@opencode-ai/plugin";

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

interface Todo {
  content: string;
  status: string;
}

interface Decision {
  decision: string;
  reason: string;
}

interface TriedFailed {
  approach: string;
  why_failed: string;
}

interface HandoffArgs {
  previousSessionId: string;
  task: string;
  blocked: string;
  modified_files: string[];
  reference_files: string[];
  decisions: Decision[];
  tried_failed: TriedFailed[];
  next_steps: string[];
  user_prefs: string[];
  todos?: Todo[];
}

function buildBlockedSection(blocked: string): string[] {
  if (!blocked || blocked === "none") return [];
  return ["", "### Blocked", blocked];
}

function buildTodosSection(todos: Todo[] | undefined): string[] {
  if (!todos || todos.length === 0) return [];
  const completed = todos.filter((t) => t.status === "completed").length;
  const inProgress = todos.filter((t) => t.status === "in_progress");
  const pending = todos.filter((t) => t.status === "pending");
  const lines = ["", "### Todos", `${completed}/${todos.length} complete`];
  if (inProgress.length > 0) {
    lines.push(`In progress: ${inProgress.map((t) => t.content).join(", ")}`);
  }
  if (pending.length > 0) {
    lines.push(`Pending: ${pending.map((t) => t.content).join(", ")}`);
  }
  return lines;
}

function buildFilesSection(modified: string[], reference: string[]): string[] {
  if (modified.length === 0 && reference.length === 0) return [];
  const lines = ["", "### Files"];
  if (modified.length > 0) lines.push(`Modified: ${modified.join(", ")}`);
  if (reference.length > 0) lines.push(`Reference: ${reference.join(", ")}`);
  return lines;
}

function buildDecisionsSection(decisions: Decision[]): string[] {
  if (decisions.length === 0) return [];
  return ["", "### Decisions Made", ...decisions.map((d) => `- ${d.decision}: ${d.reason}`)];
}

function buildTriedFailedSection(tried: TriedFailed[]): string[] {
  if (tried.length === 0) return [];
  return ["", "### Tried & Failed", ...tried.map((t) => `- ${t.approach}: ${t.why_failed}`)];
}

function buildNextStepsSection(steps: string[]): string[] {
  if (steps.length === 0) return [];
  return ["", "### Next Steps", ...steps.map((step, i) => `${i + 1}. ${step}`)];
}

function buildUserPrefsSection(prefs: string[]): string[] {
  if (prefs.length === 0) return [];
  return ["", "### User Preferences", ...prefs.map((p) => `- ${p}`)];
}

function buildHandoffPrompt(args: HandoffArgs): string {
  const lines = [
    "## Handoff Continuation Prompt",
    "",
    "### Task",
    args.task || "Continue previous work",
    ...buildBlockedSection(args.blocked),
    ...buildTodosSection(args.todos),
    ...buildFilesSection(args.modified_files, args.reference_files),
    ...buildDecisionsSection(args.decisions),
    ...buildTriedFailedSection(args.tried_failed),
    ...buildNextStepsSection(args.next_steps),
    ...buildUserPrefsSection(args.user_prefs),
    "",
    "---",
    `Continuing from session \`${args.previousSessionId}\`. Use \`read_session\` tool if you need additional context.`,
  ];
  return lines.join("\n");
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
    const assistantMessages = result.data.filter((m: Message) => m.role === "assistant");
    return extractModelFromMessage(assistantMessages[assistantMessages.length - 1]);
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

function createHandoffTool(pluginCtx: PluginContext): ToolDefinition {
  return {
    description: `Generate a minimal continuation prompt and start a new session with it.

When called, this tool:
1. Reads current todo state
2. Generates a compact handoff prompt (~200-400 tokens)
3. Creates a new session with that prompt
4. Returns the new session ID

Use this when the user says "handoff" or "session handoff" to seamlessly continue work in a fresh context window.`,
    args: {},
    async execute(_args, ctx) {
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

function createReadSessionTool(pluginCtx: {
  directory: string;
  client: PluginClient;
}): ToolDefinition {
  return {
    description: `Read messages from a previous session to get additional context.

Use this when you're in a handoff session and need more details about what was discussed or decided in the previous session.`,
    args: {},
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
  // Cast client to our simplified interface - the actual SDK types are complex
  // and we only use a subset of the API
  const client = ctx.client as unknown as PluginClient;
  return {
    tool: {
      session_handoff: createHandoffTool({
        directory: ctx.directory,
        client,
        serverUrl: ctx.serverUrl,
      }),
      read_session: createReadSessionTool({
        directory: ctx.directory,
        client,
      }),
    },
  };
};

export default HandoffPlugin;

export { buildHandoffPrompt };

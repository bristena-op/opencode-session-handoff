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

export interface HandoffArgs {
  previousSessionId: string;
  summary: string;
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
  return ["", "**Blocked:** " + blocked];
}

function buildTodosSection(todos: Todo[] | undefined): string[] {
  if (!todos || todos.length === 0) return [];
  const completed = todos.filter((t) => t.status === "completed").length;
  const inProgress = todos.filter((t) => t.status === "in_progress");
  const pending = todos.filter((t) => t.status === "pending");
  const lines = ["", `**Todos:** ${completed}/${todos.length} done`];
  if (inProgress.length > 0) {
    lines.push(`- In progress: ${inProgress.map((t) => t.content).join(", ")}`);
  }
  if (pending.length > 0) {
    lines.push(`- Pending: ${pending.map((t) => t.content).join(", ")}`);
  }
  return lines;
}

function buildFilesSection(modified: string[]): string[] {
  if (modified.length === 0) return [];
  return ["", `**Files:** ${modified.join(", ")}`];
}

function buildDecisionsSection(decisions: Decision[]): string[] {
  if (decisions.length === 0) return [];
  const items = decisions.map((d) => (d.reason ? `${d.decision} (${d.reason})` : d.decision));
  return ["", `**Decisions:** ${items.join("; ")}`];
}

function buildNextStepsSection(steps: string[]): string[] {
  if (steps.length === 0) return [];
  return ["", "**Next:** " + steps.map((s, i) => `${i + 1}. ${s}`).join(" ")];
}

export function buildHandoffPrompt(args: HandoffArgs): string {
  return [
    "## Session Handoff",
    "",
    args.summary,
    ...buildBlockedSection(args.blocked),
    ...buildTodosSection(args.todos),
    ...buildFilesSection(args.modified_files),
    ...buildDecisionsSection(args.decisions),
    ...buildNextStepsSection(args.next_steps),
    "",
    `---`,
    `Previous: \`${args.previousSessionId}\` · Use \`read_session\` if you need more context.`,
  ].join("\n");
}

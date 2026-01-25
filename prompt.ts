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

export function buildHandoffPrompt(args: HandoffArgs): string {
  return [
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
  ].join("\n");
}

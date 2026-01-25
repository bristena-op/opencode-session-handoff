import { describe, it, expect } from "vitest";
import { buildHandoffPrompt, type HandoffArgs } from "./prompt.ts";

const baseArgs: HandoffArgs = {
  previousSessionId: "ses_123",
  task: "Test task",
  blocked: "",
  modified_files: [],
  reference_files: [],
  decisions: [],
  tried_failed: [],
  next_steps: [],
  user_prefs: [],
};

function build(overrides: Partial<HandoffArgs> = {}) {
  return buildHandoffPrompt({ ...baseArgs, ...overrides });
}

describe("buildHandoffPrompt - basic", () => {
  it("generates basic prompt with task", () => {
    const result = build({ task: "Implement feature X" });
    expect(result).toContain("## Handoff Continuation Prompt");
    expect(result).toContain("### Task");
    expect(result).toContain("Implement feature X");
    expect(result).toContain("ses_123");
  });

  it("uses default task when empty", () => {
    expect(build({ task: "" })).toContain("Continue previous work");
  });

  it("includes read_session tool hint", () => {
    const result = build({ previousSessionId: "ses_abc" });
    expect(result).toContain("Use `read_session` tool if you need additional context");
  });
});

describe("buildHandoffPrompt - blocked", () => {
  it("includes blocked section when provided", () => {
    const result = build({ blocked: "Waiting for API response" });
    expect(result).toContain("### Blocked");
    expect(result).toContain("Waiting for API response");
  });

  it("excludes blocked section when empty or none", () => {
    expect(build({ blocked: "none" })).not.toContain("### Blocked");
    expect(build({ blocked: "" })).not.toContain("### Blocked");
  });
});

describe("buildHandoffPrompt - todos", () => {
  it("includes todos with status summary", () => {
    const result = build({
      todos: [
        { content: "Task 1", status: "completed" },
        { content: "Task 2", status: "in_progress" },
        { content: "Task 3", status: "pending" },
      ],
    });
    expect(result).toContain("### Todos");
    expect(result).toContain("1/3 complete");
    expect(result).toContain("In progress: Task 2");
    expect(result).toContain("Pending: Task 3");
  });
});

describe("buildHandoffPrompt - files", () => {
  it("includes modified and reference files", () => {
    const result = build({
      modified_files: ["src/index.ts", "src/utils.ts"],
      reference_files: ["docs/api.md"],
    });
    expect(result).toContain("### Files");
    expect(result).toContain("Modified: src/index.ts, src/utils.ts");
    expect(result).toContain("Reference: docs/api.md");
  });
});

describe("buildHandoffPrompt - decisions & failures", () => {
  it("includes decisions made", () => {
    const result = build({ decisions: [{ decision: "Use ESM", reason: "Better tree-shaking" }] });
    expect(result).toContain("### Decisions Made");
    expect(result).toContain("- Use ESM: Better tree-shaking");
  });

  it("includes tried and failed approaches", () => {
    const result = build({
      tried_failed: [{ approach: "Direct import", why_failed: "Circular dependency" }],
    });
    expect(result).toContain("### Tried & Failed");
    expect(result).toContain("- Direct import: Circular dependency");
  });
});

describe("buildHandoffPrompt - steps & prefs", () => {
  it("includes numbered next steps", () => {
    const result = build({ next_steps: ["Fix tests", "Update docs"] });
    expect(result).toContain("### Next Steps");
    expect(result).toContain("1. Fix tests");
    expect(result).toContain("2. Update docs");
  });

  it("includes user preferences", () => {
    const result = build({ user_prefs: ["Prefer functional style", "No classes"] });
    expect(result).toContain("### User Preferences");
    expect(result).toContain("- Prefer functional style");
    expect(result).toContain("- No classes");
  });
});

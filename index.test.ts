import { describe, it, expect } from "vitest";
import { buildHandoffPrompt, type HandoffArgs } from "./prompt.ts";

const baseArgs: HandoffArgs = {
  previousSessionId: "ses_123",
  summary: "Working on feature X. Completed initial setup.",
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
  it("generates prompt with summary", () => {
    const result = build({ summary: "Refactored auth module. Tests passing." });
    expect(result).toContain("## Session Handoff");
    expect(result).toContain("Refactored auth module. Tests passing.");
    expect(result).toContain("ses_123");
  });

  it("includes read_session hint", () => {
    const result = build({ previousSessionId: "ses_abc" });
    expect(result).toContain("read_session");
    expect(result).toContain("ses_abc");
  });
});

describe("buildHandoffPrompt - blocked", () => {
  it("includes blocked when provided", () => {
    const result = build({ blocked: "Waiting for API response" });
    expect(result).toContain("**Blocked:**");
    expect(result).toContain("Waiting for API response");
  });

  it("excludes blocked when empty or none", () => {
    expect(build({ blocked: "none" })).not.toContain("Blocked");
    expect(build({ blocked: "" })).not.toContain("Blocked");
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
    expect(result).toContain("**Todos:** 1/3 done");
    expect(result).toContain("In progress: Task 2");
    expect(result).toContain("Pending: Task 3");
  });
});

describe("buildHandoffPrompt - files", () => {
  it("includes modified files", () => {
    const result = build({ modified_files: ["src/index.ts", "src/utils.ts"] });
    expect(result).toContain("**Files:**");
    expect(result).toContain("src/index.ts, src/utils.ts");
  });

  it("excludes files section when empty", () => {
    expect(build({ modified_files: [] })).not.toContain("**Files:**");
  });
});

describe("buildHandoffPrompt - decisions", () => {
  it("includes decisions with reason", () => {
    const result = build({ decisions: [{ decision: "Use ESM", reason: "Better tree-shaking" }] });
    expect(result).toContain("**Decisions:**");
    expect(result).toContain("Use ESM (Better tree-shaking)");
  });

  it("includes decisions without reason", () => {
    const result = build({ decisions: [{ decision: "Use ESM", reason: "" }] });
    expect(result).toContain("**Decisions:** Use ESM");
  });
});

describe("buildHandoffPrompt - next steps", () => {
  it("includes numbered next steps inline", () => {
    const result = build({ next_steps: ["Fix tests", "Update docs"] });
    expect(result).toContain("**Next:** 1. Fix tests 2. Update docs");
  });

  it("excludes next steps when empty", () => {
    expect(build({ next_steps: [] })).not.toContain("**Next:**");
  });
});

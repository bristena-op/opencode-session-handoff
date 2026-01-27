import { describe, it, expect } from "vitest";
import { buildHandoffPrompt, type HandoffArgs } from "./prompt.ts";
import { isHandoffTrigger, extractGoalFromHandoff } from "./index.ts";

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

describe("isHandoffTrigger", () => {
  it("returns true for 'handoff'", () => {
    expect(isHandoffTrigger("handoff")).toBe(true);
    expect(isHandoffTrigger("Handoff")).toBe(true);
    expect(isHandoffTrigger("HANDOFF")).toBe(true);
    expect(isHandoffTrigger("  handoff  ")).toBe(true);
  });

  it("returns true for '/handoff'", () => {
    expect(isHandoffTrigger("/handoff")).toBe(true);
    expect(isHandoffTrigger("/Handoff")).toBe(true);
    expect(isHandoffTrigger("  /handoff  ")).toBe(true);
  });

  it("returns true for 'session handoff'", () => {
    expect(isHandoffTrigger("session handoff")).toBe(true);
    expect(isHandoffTrigger("Session Handoff")).toBe(true);
  });

  it("returns true for 'handoff <goal>'", () => {
    expect(isHandoffTrigger("handoff implement login")).toBe(true);
    expect(isHandoffTrigger("handoff fix the bug")).toBe(true);
  });

  it("returns true for '/handoff <goal>'", () => {
    expect(isHandoffTrigger("/handoff implement login")).toBe(true);
    expect(isHandoffTrigger("/handoff fix tests")).toBe(true);
  });

  it("returns false for non-handoff messages", () => {
    expect(isHandoffTrigger("implement handoff feature")).toBe(false);
    expect(isHandoffTrigger("hello world")).toBe(false);
    expect(isHandoffTrigger("hand off the work")).toBe(false);
  });
});

describe("extractGoalFromHandoff", () => {
  it("extracts goal from 'handoff <goal>'", () => {
    expect(extractGoalFromHandoff("handoff implement login")).toBe("implement login");
    expect(extractGoalFromHandoff("handoff fix the failing tests")).toBe("fix the failing tests");
    expect(extractGoalFromHandoff("Handoff Create PR")).toBe("Create PR");
  });

  it("extracts goal from '/handoff <goal>'", () => {
    expect(extractGoalFromHandoff("/handoff implement login")).toBe("implement login");
    expect(extractGoalFromHandoff("/handoff fix tests")).toBe("fix tests");
  });

  it("returns null for standalone handoff", () => {
    expect(extractGoalFromHandoff("handoff")).toBe(null);
    expect(extractGoalFromHandoff("/handoff")).toBe(null);
    expect(extractGoalFromHandoff("  handoff  ")).toBe(null);
  });

  it("returns null for 'handoff ' with only whitespace after", () => {
    expect(extractGoalFromHandoff("handoff   ")).toBe(null);
    expect(extractGoalFromHandoff("/handoff   ")).toBe(null);
  });

  it("returns null for non-handoff messages", () => {
    expect(extractGoalFromHandoff("hello world")).toBe(null);
    expect(extractGoalFromHandoff("session handoff")).toBe(null);
  });
});

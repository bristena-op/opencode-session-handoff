import { describe, it, expect } from "vitest";
import { buildHandoffPrompt } from "./index";

describe("buildHandoffPrompt", () => {
  it("generates basic prompt with task", () => {
    const result = buildHandoffPrompt({
      previousSessionId: "ses_123",
      task: "Implement feature X",
      blocked: "",
      modified_files: [],
      reference_files: [],
      decisions: [],
      tried_failed: [],
      next_steps: [],
      user_prefs: [],
    });

    expect(result).toContain("## Handoff Continuation Prompt");
    expect(result).toContain("### Task");
    expect(result).toContain("Implement feature X");
    expect(result).toContain("ses_123");
  });

  it("includes blocked section when provided", () => {
    const result = buildHandoffPrompt({
      previousSessionId: "ses_123",
      task: "Test task",
      blocked: "Waiting for API response",
      modified_files: [],
      reference_files: [],
      decisions: [],
      tried_failed: [],
      next_steps: [],
      user_prefs: [],
    });

    expect(result).toContain("### Blocked");
    expect(result).toContain("Waiting for API response");
  });

  it("excludes blocked section when empty or none", () => {
    const result = buildHandoffPrompt({
      previousSessionId: "ses_123",
      task: "Test task",
      blocked: "none",
      modified_files: [],
      reference_files: [],
      decisions: [],
      tried_failed: [],
      next_steps: [],
      user_prefs: [],
    });

    expect(result).not.toContain("### Blocked");
  });

  it("includes todos with status summary", () => {
    const result = buildHandoffPrompt({
      previousSessionId: "ses_123",
      task: "Test task",
      blocked: "",
      modified_files: [],
      reference_files: [],
      decisions: [],
      tried_failed: [],
      next_steps: [],
      user_prefs: [],
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

  it("includes modified and reference files", () => {
    const result = buildHandoffPrompt({
      previousSessionId: "ses_123",
      task: "Test task",
      blocked: "",
      modified_files: ["src/index.ts", "src/utils.ts"],
      reference_files: ["docs/api.md"],
      decisions: [],
      tried_failed: [],
      next_steps: [],
      user_prefs: [],
    });

    expect(result).toContain("### Files");
    expect(result).toContain("Modified: src/index.ts, src/utils.ts");
    expect(result).toContain("Reference: docs/api.md");
  });

  it("includes decisions made", () => {
    const result = buildHandoffPrompt({
      previousSessionId: "ses_123",
      task: "Test task",
      blocked: "",
      modified_files: [],
      reference_files: [],
      decisions: [{ decision: "Use ESM", reason: "Better tree-shaking" }],
      tried_failed: [],
      next_steps: [],
      user_prefs: [],
    });

    expect(result).toContain("### Decisions Made");
    expect(result).toContain("- Use ESM: Better tree-shaking");
  });

  it("includes tried and failed approaches", () => {
    const result = buildHandoffPrompt({
      previousSessionId: "ses_123",
      task: "Test task",
      blocked: "",
      modified_files: [],
      reference_files: [],
      decisions: [],
      tried_failed: [{ approach: "Direct import", why_failed: "Circular dependency" }],
      next_steps: [],
      user_prefs: [],
    });

    expect(result).toContain("### Tried & Failed");
    expect(result).toContain("- Direct import: Circular dependency");
  });

  it("includes numbered next steps", () => {
    const result = buildHandoffPrompt({
      previousSessionId: "ses_123",
      task: "Test task",
      blocked: "",
      modified_files: [],
      reference_files: [],
      decisions: [],
      tried_failed: [],
      next_steps: ["Fix tests", "Update docs"],
      user_prefs: [],
    });

    expect(result).toContain("### Next Steps");
    expect(result).toContain("1. Fix tests");
    expect(result).toContain("2. Update docs");
  });

  it("includes user preferences", () => {
    const result = buildHandoffPrompt({
      previousSessionId: "ses_123",
      task: "Test task",
      blocked: "",
      modified_files: [],
      reference_files: [],
      decisions: [],
      tried_failed: [],
      next_steps: [],
      user_prefs: ["Prefer functional style", "No classes"],
    });

    expect(result).toContain("### User Preferences");
    expect(result).toContain("- Prefer functional style");
    expect(result).toContain("- No classes");
  });

  it("uses default task when empty", () => {
    const result = buildHandoffPrompt({
      previousSessionId: "ses_123",
      task: "",
      blocked: "",
      modified_files: [],
      reference_files: [],
      decisions: [],
      tried_failed: [],
      next_steps: [],
      user_prefs: [],
    });

    expect(result).toContain("Continue previous work");
  });

  it("includes read_session tool hint", () => {
    const result = buildHandoffPrompt({
      previousSessionId: "ses_abc",
      task: "Test",
      blocked: "",
      modified_files: [],
      reference_files: [],
      decisions: [],
      tried_failed: [],
      next_steps: [],
      user_prefs: [],
    });

    expect(result).toContain("Use `read_session` tool if you need additional context");
  });
});

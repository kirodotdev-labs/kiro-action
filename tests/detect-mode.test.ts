import { describe, it, expect, mock, beforeEach } from "bun:test";

// Mock @actions/core before importing detect
const inputs: Record<string, string> = {};
mock.module("@actions/core", () => ({
  getInput: (name: string) => inputs[name] ?? "",
  debug: () => {},
  info: () => {},
}));

const { detectMode } = await import("../src/modes/detect");
import type { GithubContext } from "../src/github/context";

function makeCtx(overrides: Partial<GithubContext> = {}): GithubContext {
  return {
    eventName: "unknown",
    owner: "test-owner",
    repo: "test-repo",
    ...overrides,
  };
}

describe("detectMode", () => {
  beforeEach(() => {
    Object.keys(inputs).forEach((k) => delete inputs[k]);
  });

  it("returns auto when explicit prompt is provided", () => {
    inputs["prompt"] = "fix the bug";
    expect(detectMode(makeCtx())).toBe("auto");
  });

  it("returns comment for issue_comment with /kiro mention", () => {
    inputs["trigger_phrase"] = "/kiro";
    const ctx = makeCtx({ eventName: "issue_comment", commentBody: "hey /kiro fix this", issueNumber: 1 });
    expect(detectMode(ctx)).toBe("comment");
  });

  it("returns comment for pull_request_review_comment with trigger", () => {
    inputs["trigger_phrase"] = "/kiro";
    const ctx = makeCtx({ eventName: "pull_request_review_comment", commentBody: "/kiro refactor", prNumber: 5 });
    expect(detectMode(ctx)).toBe("comment");
  });

  it("returns skip when comment lacks trigger phrase", () => {
    inputs["trigger_phrase"] = "/kiro";
    const ctx = makeCtx({ eventName: "issue_comment", commentBody: "nice PR!", issueNumber: 1 });
    expect(detectMode(ctx)).toBe("skip");
  });

  it("returns assign when issue assigned to kiro", () => {
    inputs["assignee_trigger"] = "kiro";
    const ctx = makeCtx({ eventName: "issues", assignee: "kiro", issueNumber: 2 });
    expect(detectMode(ctx)).toBe("assign");
  });

  it("returns assign case-insensitively", () => {
    inputs["assignee_trigger"] = "kiro";
    const ctx = makeCtx({ eventName: "issues", assignee: "Kiro", issueNumber: 2 });
    expect(detectMode(ctx)).toBe("assign");
  });

  it("returns skip when assignee does not match", () => {
    inputs["assignee_trigger"] = "kiro";
    const ctx = makeCtx({ eventName: "issues", assignee: "someone-else", issueNumber: 2 });
    expect(detectMode(ctx)).toBe("skip");
  });

  it("returns skip for unrecognized events", () => {
    const ctx = makeCtx({ eventName: "push" });
    expect(detectMode(ctx)).toBe("skip");
  });

  it("returns label when issue is labeled with the trigger label", () => {
    inputs["label_trigger"] = "kiro";
    const ctx = makeCtx({
      eventName: "issues",
      action: "labeled",
      label: "kiro",
      issueNumber: 4,
    });
    expect(detectMode(ctx)).toBe("label");
  });

  it("returns label for pull_request labeled events", () => {
    inputs["label_trigger"] = "kiro";
    const ctx = makeCtx({
      eventName: "pull_request",
      action: "labeled",
      label: "kiro",
      prNumber: 9,
    });
    expect(detectMode(ctx)).toBe("label");
  });

  it("matches label trigger case-insensitively", () => {
    inputs["label_trigger"] = "kiro";
    const ctx = makeCtx({
      eventName: "issues",
      action: "labeled",
      label: "Kiro",
      issueNumber: 4,
    });
    expect(detectMode(ctx)).toBe("label");
  });

  it("does not fire label-mode on non-label issue actions", () => {
    inputs["label_trigger"] = "kiro";
    const ctx = makeCtx({
      eventName: "issues",
      action: "edited",
      label: "kiro",
      issueNumber: 4,
    });
    expect(detectMode(ctx)).toBe("skip");
  });

  it("respects custom label_trigger", () => {
    inputs["label_trigger"] = "ai-fix";
    const ctx = makeCtx({
      eventName: "issues",
      action: "labeled",
      label: "ai-fix",
      issueNumber: 4,
    });
    expect(detectMode(ctx)).toBe("label");
  });

  it("returns skip when labeled with a different label", () => {
    inputs["label_trigger"] = "kiro";
    const ctx = makeCtx({
      eventName: "issues",
      action: "labeled",
      label: "bug",
      issueNumber: 4,
    });
    expect(detectMode(ctx)).toBe("skip");
  });

  it("comment trigger takes priority over label trigger", () => {
    inputs["trigger_phrase"] = "/kiro";
    inputs["label_trigger"] = "kiro";
    // comment events don't carry label, so this is testing that label doesn't override comment
    const ctx = makeCtx({
      eventName: "issue_comment",
      commentBody: "/kiro fix",
      issueNumber: 4,
    });
    expect(detectMode(ctx)).toBe("comment");
  });
});

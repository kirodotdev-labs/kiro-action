import { describe, it, expect, mock, beforeEach } from "bun:test";

// Mode-handler tests mock internal ../src modules, whose mocks are process-global
// in Bun and would leak into those modules' own test files. They therefore run
// in a SEPARATE `bun test` invocation (see package.json "test") so nothing else
// shares this process. Records the order of the key steps to assert that git
// state is prepared (identity + PR checkout) BEFORE Kiro runs.

const order: string[] = [];
const inputs: Record<string, string> = { github_token: "t", trigger_phrase: "/kiro" };
let permission = "write";

mock.module("@actions/core", () => ({
  getInput: (name: string) => inputs[name] ?? "",
  info: () => {},
  debug: () => {},
  warning: () => {},
  setFailed: () => {},
  setOutput: () => {},
}));

mock.module("@actions/github", () => ({
  getOctokit: () => ({
    rest: {
      repos: {
        getCollaboratorPermissionLevel: async () => ({ data: { permission } }),
      },
    },
  }),
}));

mock.module("../../src/prompt/build-prompt", () => ({
  buildPrompt: async () => { order.push("buildPrompt"); return "PROMPT"; },
}));

mock.module("../../src/kiro/runner", () => ({
  runKiro: async () => { order.push("runKiro"); return { output: "## Summary\ndone\n", exitCode: 0 }; },
}));

mock.module("../../src/github/comment", () => ({
  findExistingKiroComment: async () => undefined,
  postProgressComment: async () => 123,
  updateComment: async () => {},
}));

mock.module("../../src/github/pr", () => ({
  configureGitIdentity: async () => { order.push("configureGitIdentity"); },
  getHeadSha: async () => { order.push("getHeadSha"); return "sha0"; },
  checkoutPrBranch: async () => { order.push("checkoutPrBranch"); return "feature/x"; },
  createBranch: async () => { order.push("createBranch"); return "kiro/issue-7-x"; },
  commitAndPush: async () => { order.push("commitAndPush"); return true; },
  getDefaultBranch: async () => { order.push("getDefaultBranch"); return "main"; },
  openPullRequest: async () => { order.push("openPullRequest"); return "https://github.com/o/r/pull/9"; },
}));

mock.module("../../src/utils/extract-output", () => ({
  parseKiroOutput: () => ({ prTitle: "t", summary: "done" }),
}));

const { runCommentMode } = await import("../../src/modes/comment-mode");
import type { GithubContext } from "../../src/github/context";

function ctx(over: Partial<GithubContext> = {}): GithubContext {
  return {
    eventName: "issue_comment",
    owner: "o",
    repo: "r",
    commentAuthor: "alice",
    ...over,
  } as GithubContext;
}

describe("runCommentMode ordering", () => {
  beforeEach(() => {
    order.length = 0;
    permission = "write";
  });

  it("PR comment: checks out the PR branch and sets identity BEFORE running Kiro", async () => {
    await runCommentMode(ctx({ prNumber: 42, commentBody: "/kiro fix" }), "key");

    const iCheckout = order.indexOf("checkoutPrBranch");
    const iIdentity = order.indexOf("configureGitIdentity");
    const iKiro = order.indexOf("runKiro");

    expect(iKiro).toBeGreaterThanOrEqual(0);
    expect(iCheckout).toBeGreaterThanOrEqual(0);
    // The bug this guards against: checkout ran AFTER Kiro.
    expect(iCheckout).toBeLessThan(iKiro);
    expect(iIdentity).toBeLessThan(iKiro);
    // On a PR we push to the checked-out branch; we do not create a new one.
    expect(order).not.toContain("createBranch");
  });

  it("issue comment: sets identity before Kiro, creates the branch AFTER Kiro", async () => {
    await runCommentMode(ctx({ issueNumber: 7, commentBody: "/kiro fix" }), "key");

    const iKiro = order.indexOf("runKiro");
    expect(order.indexOf("configureGitIdentity")).toBeLessThan(iKiro);
    expect(order).not.toContain("checkoutPrBranch");
    expect(order.indexOf("createBranch")).toBeGreaterThan(iKiro);
    expect(order.indexOf("openPullRequest")).toBeGreaterThan(iKiro);
  });

  it("captures HEAD sha before running Kiro", async () => {
    await runCommentMode(ctx({ prNumber: 42, commentBody: "/kiro fix" }), "key");
    expect(order.indexOf("getHeadSha")).toBeLessThan(order.indexOf("runKiro"));
  });

  it("ignores the trigger when the commenter lacks write access", async () => {
    permission = "read";
    const res = await runCommentMode(ctx({ prNumber: 42, commentBody: "/kiro fix" }), "key");
    expect(res.output).toBe("");
    expect(order).not.toContain("runKiro");
  });
});

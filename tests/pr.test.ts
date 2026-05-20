import { describe, it, expect, mock, beforeEach } from "bun:test";

const inputs: Record<string, string> = {};
const execCalls: string[][] = [];
let statusOutput = "";
let revListCount = "0\n";

mock.module("@actions/core", () => ({
  getInput: (name: string) => inputs[name] ?? "",
  debug: () => {},
  info: () => {},
  warning: () => {},
}));

mock.module("@actions/github", () => ({ getOctokit: () => ({}) }));

mock.module("@actions/exec", () => ({
  exec: async (cmd: string, args: string[], opts?: { listeners?: { stdout?: (d: Buffer) => void } }) => {
    execCalls.push([cmd, ...args]);
    if (args.includes("--porcelain") && opts?.listeners?.stdout) {
      opts.listeners.stdout(Buffer.from(statusOutput));
    }
    if (args[0] === "rev-list" && opts?.listeners?.stdout) {
      opts.listeners.stdout(Buffer.from(revListCount));
    }
    return 0;
  },
}));

const { createBranch, checkoutPrBranch, commitAndPush, openPullRequest, getDefaultBranch } =
  await import("../src/github/pr");

function makeOctokit(overrides: Record<string, unknown> = {}) {
  return {
    rest: {
      pulls: {
        create: async () => ({ data: { html_url: "https://github.com/owner/repo/pull/99" } }),
        ...overrides,
      },
      repos: {
        get: async () => ({ data: { default_branch: "main" } }),
        ...overrides,
      },
    },
  } as any;
}

describe("createBranch", () => {
  beforeEach(() => {
    execCalls.length = 0;
    Object.keys(inputs).forEach((k) => delete inputs[k]);
  });

  it("creates branch with default prefix kiro/ and timestamp", async () => {
    const name = await createBranch("issue", 5);
    expect(name).toMatch(/^kiro\/issue-5-\d{8}-\d{4}$/);
    expect(execCalls.some((c) => c[0] === "git" && c[1] === "checkout")).toBe(true);
  });

  it("uses custom branch_prefix input", async () => {
    inputs["branch_prefix"] = "bot/";
    const name = await createBranch("issue", 3);
    expect(name).toStartWith("bot/issue-3-");
  });

  it("uses pr entity type correctly", async () => {
    const name = await createBranch("pr", 7);
    expect(name).toMatch(/^kiro\/pr-7-\d{8}-\d{4}$/);
  });

  it("truncates branch name to 50 chars", async () => {
    inputs["branch_prefix"] = "a".repeat(45) + "/";
    const name = await createBranch("issue", 999);
    expect(name.length).toBeLessThanOrEqual(50);
  });
});

describe("checkoutPrBranch", () => {
  beforeEach(() => { execCalls.length = 0; });

  it("fetches and checks out the PR head branch", async () => {
    const octokit = {
      rest: {
        pulls: {
          get: async () => ({ data: { head: { ref: "feature/my-pr-branch" } } }),
        },
      },
    } as any;
    const branch = await checkoutPrBranch(octokit, "owner", "repo", 42);
    expect(branch).toBe("feature/my-pr-branch");
    expect(execCalls.some((c) => c.includes("fetch") && c.includes("feature/my-pr-branch"))).toBe(true);
    expect(execCalls.some((c) => c.includes("checkout") && c.includes("feature/my-pr-branch"))).toBe(true);
  });
});

describe("commitAndPush", () => {
  beforeEach(() => {
    execCalls.length = 0;
    statusOutput = "";
    revListCount = "0\n";
  });

  it("returns false and skips push when working tree is clean and branch has no new commits", async () => {
    statusOutput = "";
    revListCount = "0\n";
    const result = await commitAndPush("kiro/1-fix", "chore: kiro changes", "origin/main");
    expect(result).toBe(false);
    expect(execCalls.some((c) => c.includes("commit"))).toBe(false);
    expect(execCalls.some((c) => c.includes("push"))).toBe(false);
  });

  it("commits dirty files and pushes when working tree has changes", async () => {
    statusOutput = "M  src/foo.ts\n";
    revListCount = "1\n";
    const result = await commitAndPush("kiro/1-fix", "chore: kiro changes", "origin/main");
    expect(result).toBe(true);
    expect(execCalls.some((c) => c.includes("commit"))).toBe(true);
    expect(execCalls.some((c) => c.includes("push"))).toBe(true);
  });

  it("pushes when Kiro committed changes itself (clean tree, commits ahead)", async () => {
    statusOutput = "";
    revListCount = "2\n";
    const result = await commitAndPush("kiro/1-fix", "chore: kiro changes", "origin/main");
    expect(result).toBe(true);
    expect(execCalls.some((c) => c.includes("commit"))).toBe(false);
    expect(execCalls.some((c) => c.includes("push"))).toBe(true);
  });

  it("compares against the provided ref (not hardcoded main)", async () => {
    statusOutput = "";
    revListCount = "1\n";
    await commitAndPush("kiro/feat/x", "msg", "origin/feature-branch");
    const revListCall = execCalls.find((c) => c.includes("rev-list"));
    expect(revListCall).toContain("origin/feature-branch..HEAD");
  });
});

describe("openPullRequest", () => {
  it("returns the PR url", async () => {
    const url = await openPullRequest(
      makeOctokit(), "owner", "repo", "kiro/1-fix", "Fix", "body", "main"
    );
    expect(url).toBe("https://github.com/owner/repo/pull/99");
  });
});

describe("getDefaultBranch", () => {
  it("returns the default branch name", async () => {
    const branch = await getDefaultBranch(makeOctokit(), "owner", "repo");
    expect(branch).toBe("main");
  });
});

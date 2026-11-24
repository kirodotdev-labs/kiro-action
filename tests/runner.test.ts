import { describe, it, expect, mock } from "bun:test";
import { EventEmitter } from "events";

const inputs: Record<string, string> = {};
mock.module("@actions/core", () => ({
  getInput: (name: string) => inputs[name] ?? "",
  debug: () => {},
  info: () => {},
  warning: () => {},
}));

// We mock child_process.spawn to return a fake process object
// rather than actually spawning kiro (which isn't installed in test env)
type FakeProc = {
  stdout: EventEmitter;
  stderr: EventEmitter;
  emit: (event: string, ...args: unknown[]) => void;
} & EventEmitter;

let spawnCallback: ((proc: FakeProc) => void) | null = null;
let lastSpawnArgs: string[] = [];
let lastSpawnEnv: Record<string, string | undefined> = {};

mock.module("child_process", () => ({
  spawn: (_cmd: string, args: string[], opts: { env: Record<string, string | undefined> }) => {
    lastSpawnArgs = args;
    lastSpawnEnv = opts.env;
    const proc = new EventEmitter() as FakeProc;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    // Let the test drive what the fake process does
    if (spawnCallback) spawnCallback(proc);
    return proc;
  },
}));

const { runKiro, buildKiroArgs, createLineLogger } = await import("../src/kiro/runner");

function makeProc(): FakeProc {
  const proc = new EventEmitter() as FakeProc;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  return proc;
}

describe("runKiro", () => {
  it("resolves with stdout output and exit code 0", async () => {
    spawnCallback = (proc) => {
      setImmediate(() => {
        proc.stdout.emit("data", Buffer.from("Task completed successfully\n"));
        proc.emit("close", 0);
      });
    };
    const result = await runKiro("fix the bug", "test-api-key");
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Task completed successfully");
  });

  it("leaves stderr out of the output when the run succeeds", async () => {
    spawnCallback = (proc) => {
      setImmediate(() => {
        proc.stdout.emit("data", Buffer.from("stdout line\n"));
        proc.stderr.emit("data", Buffer.from('[INFO] kas.server.starting {"version":"0.66.70"}\n'));
        proc.emit("close", 0);
      });
    };
    const result = await runKiro("do something", "test-api-key");
    expect(result.output).toBe("stdout line");
  });

  it("includes stderr in the output when the run fails", async () => {
    spawnCallback = (proc) => {
      setImmediate(() => {
        proc.stdout.emit("data", Buffer.from("partial reply\n"));
        proc.stderr.emit("data", Buffer.from("tool permission denied\n"));
        proc.emit("close", 2);
      });
    };
    const result = await runKiro("do something", "test-api-key");
    expect(result.output).toBe("partial reply\ntool permission denied");
  });

  it("passes the V3 engine flag and kiro_args to kiro-cli", async () => {
    inputs["kiro_args"] = "--trust-all-tools --effort high";
    spawnCallback = (proc) => {
      setImmediate(() => proc.emit("close", 0));
    };
    await runKiro("fix it", "key");
    expect(lastSpawnArgs).toEqual([
      "chat", "--no-interactive", "--v3", "--trust-all-tools", "--effort", "high", "fix it",
    ]);
    delete inputs["kiro_args"];
  });

  it("strips ANSI escape codes from output", async () => {
    spawnCallback = (proc) => {
      setImmediate(() => {
        proc.stdout.emit("data", Buffer.from("\x1b[32mgreen text\x1b[0m\n"));
        proc.emit("close", 0);
      });
    };
    const result = await runKiro("do something", "test-api-key");
    expect(result.output).toBe("green text");
    expect(result.output).not.toContain("\x1b");
  });

  it("resolves with non-zero exit code on failure", async () => {
    spawnCallback = (proc) => {
      setImmediate(() => {
        proc.stderr.emit("data", Buffer.from("auth failed\n"));
        proc.emit("close", 1);
      });
    };
    const result = await runKiro("do something", "bad-key");
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("auth failed");
  });

  it("redacts the API key and GitHub token from the output", async () => {
    inputs["github_token"] = "ghs_exampletoken123";
    spawnCallback = (proc) => {
      setImmediate(() => {
        proc.stdout.emit("data", Buffer.from("key=kiro-secret-key-xyz\n"));
        proc.stderr.emit("data", Buffer.from("token ghs_exampletoken123 rejected\n"));
        proc.emit("close", 1);
      });
    };
    const result = await runKiro("do something", "kiro-secret-key-xyz");
    expect(result.output).toBe("key=***\ntoken *** rejected");
    delete inputs["github_token"];
  });

  it("passes KIRO_API_KEY but not action inputs or the runtime token to kiro-cli", async () => {
    process.env.INPUT_KIRO_API_KEY = "input-key-value";
    process.env.INPUT_GITHUB_TOKEN = "input-token-value";
    process.env.ACTIONS_RUNTIME_TOKEN = "runtime-token-value";
    spawnCallback = (proc) => {
      setImmediate(() => proc.emit("close", 0));
    };
    await runKiro("do something", "the-api-key");
    expect(lastSpawnEnv.KIRO_API_KEY).toBe("the-api-key");
    expect(lastSpawnEnv.INPUT_KIRO_API_KEY).toBeUndefined();
    expect(lastSpawnEnv.INPUT_GITHUB_TOKEN).toBeUndefined();
    expect(lastSpawnEnv.ACTIONS_RUNTIME_TOKEN).toBeUndefined();
    expect(lastSpawnEnv.PATH).toBe(process.env.PATH);
    delete process.env.INPUT_KIRO_API_KEY;
    delete process.env.INPUT_GITHUB_TOKEN;
    delete process.env.ACTIONS_RUNTIME_TOKEN;
  });

  it("rejects when spawn itself fails (binary not found)", async () => {
    spawnCallback = (proc) => {
      setImmediate(() => {
        proc.emit("error", new Error("ENOENT: kiro not found"));
      });
    };
    await expect(runKiro("do something", "key")).rejects.toThrow("Failed to spawn kiro CLI");
  });
});

describe("buildKiroArgs", () => {
  it("defaults to the V3 engine", () => {
    expect(buildKiroArgs("do it", "--trust-all-tools")).toEqual([
      "chat", "--no-interactive", "--v3", "--trust-all-tools", "do it",
    ]);
  });

  it("adds the V3 engine flag when kiro_args is empty", () => {
    expect(buildKiroArgs("do it", "  ")).toEqual(["chat", "--no-interactive", "--v3", "do it"]);
  });

  it("respects --v2 in kiro_args", () => {
    expect(buildKiroArgs("do it", "--v2 --trust-all-tools")).toEqual([
      "chat", "--no-interactive", "--v2", "--trust-all-tools", "do it",
    ]);
  });

  it("does not duplicate an explicit --v3", () => {
    expect(buildKiroArgs("do it", "--v3")).toEqual(["chat", "--no-interactive", "--v3", "do it"]);
  });

  it("respects --agent-engine in both spellings", () => {
    expect(buildKiroArgs("p", "--agent-engine v2")).not.toContain("--v3");
    expect(buildKiroArgs("p", "--agent-engine=v2")).not.toContain("--v3");
  });

  it("keeps the prompt as the final positional argument", () => {
    const args = buildKiroArgs("multi word prompt", "--agent code-reviewer");
    expect(args[args.length - 1]).toBe("multi word prompt");
  });
});

describe("createLineLogger", () => {
  it("logs whole lines even when a line arrives split across chunks", () => {
    const lines: string[] = [];
    const logger = createLineLogger((l) => lines.push(l));
    logger.write(Buffer.from("first li"));
    logger.write(Buffer.from("ne\nsecond "));
    expect(lines).toEqual(["first line"]);
    logger.write(Buffer.from("line\n"));
    logger.write(Buffer.from("tail without newline"));
    logger.flush();
    expect(lines).toEqual(["first line", "second line", "tail without newline"]);
  });

  it("skips blank lines and strips ANSI codes", () => {
    const lines: string[] = [];
    const logger = createLineLogger((l) => lines.push(l));
    logger.write(Buffer.from("\n  \n\x1b[32mgreen\x1b[0m\n"));
    logger.flush();
    expect(lines).toEqual(["green"]);
  });

  it("does not break multi-byte characters split across chunks", () => {
    const lines: string[] = [];
    const logger = createLineLogger((l) => lines.push(l));
    const bytes = Buffer.from("✅ done\n");
    logger.write(bytes.subarray(0, 1));
    logger.write(bytes.subarray(1));
    expect(lines).toEqual(["✅ done"]);
  });
});

import * as core from "@actions/core";
import { spawn } from "child_process";
import { StringDecoder } from "string_decoder";
import { stripAnsi } from "../utils/ansi.js";
import { childEnv } from "../utils/env.js";
import { redact } from "../utils/redact.js";

export interface RunResult {
  output: string;
  exitCode: number;
}

// A headless run that names no engine runs V2 — unless --trust-all-tools is
// passed, which switches it to V3. Pin V3 explicitly so the engine doesn't
// silently depend on which other flags the user put in kiro_args. Users can
// still opt back into V2 with `--v2` (or `--agent-engine v2`).
const DEFAULT_ENGINE_FLAG = "--v3";

function hasEngineFlag(args: string[]): boolean {
  return args.some(
    (a) =>
      a === "--v2" ||
      a === "--v3" ||
      a === "--agent-engine" ||
      a.startsWith("--agent-engine="),
  );
}

export function buildKiroArgs(prompt: string, kiroArgs: string): string[] {
  const extraArgs = kiroArgs.trim().split(/\s+/).filter(Boolean);
  const engineArgs = hasEngineFlag(extraArgs) ? [] : [DEFAULT_ENGINE_FLAG];
  return ["chat", "--no-interactive", ...engineArgs, ...extraArgs, prompt];
}

/**
 * Buffers a stream into whole lines before logging. Log masking matches within
 * a single log line, so a secret split across two raw chunks would otherwise
 * slip through unmasked when step debug logging is on.
 */
export function createLineLogger(log: (line: string) => void) {
  const decoder = new StringDecoder("utf8");
  let pending = "";
  const emit = (line: string) => {
    const cleaned = stripAnsi(line).trim();
    if (cleaned) log(cleaned);
  };
  return {
    write(chunk: Buffer) {
      pending += decoder.write(chunk);
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      lines.forEach(emit);
    },
    flush() {
      pending += decoder.end();
      emit(pending);
      pending = "";
    },
  };
}

export async function runKiro(
  prompt: string,
  apiKey: string,
): Promise<RunResult> {
  const args = buildKiroArgs(prompt, core.getInput("kiro_args"));
  const secrets = [apiKey, core.getInput("github_token")];

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    // Stream cleaned output to action log without exposing the prompt content
    const stdoutLog = createLineLogger((line) =>
      core.debug(`kiro: ${redact(line, secrets)}`),
    );
    const stderrLog = createLineLogger((line) =>
      core.debug(`kiro stderr: ${redact(line, secrets)}`),
    );

    const proc = spawn("kiro-cli", args, {
      env: {
        ...childEnv(),
        KIRO_API_KEY: apiKey,
        NO_COLOR: "1",
        TERM: "dumb",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      stdoutLog.write(chunk);
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      errChunks.push(chunk);
      stderrLog.write(chunk);
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn kiro CLI: ${err.message}`));
    });

    proc.on("close", (code) => {
      stdoutLog.flush();
      stderrLog.flush();
      const exitCode = code ?? 1;
      const stdout = stripAnsi(Buffer.concat(chunks).toString("utf8")).trim();
      const stderr = stripAnsi(
        Buffer.concat(errChunks).toString("utf8"),
      ).trim();
      // Kiro writes its reply to stdout. stderr carries tool progress (V2) or
      // engine logs (V3), which would otherwise end up in the summary posted to
      // GitHub — only surface it when the run failed and it explains why.
      const output =
        exitCode !== 0 && stderr ? `${stdout}\n${stderr}`.trim() : stdout;
      resolve({ output: redact(output, secrets), exitCode });
    });
  });
}

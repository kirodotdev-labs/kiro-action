import { describe, it, expect } from "bun:test";
import { childEnv } from "../src/utils/env";

describe("childEnv", () => {
  it("drops action inputs and the runtime token", () => {
    const env = childEnv({
      INPUT_KIRO_API_KEY: "k",
      INPUT_GITHUB_TOKEN: "t",
      INPUT_PROMPT: "p",
      ACTIONS_RUNTIME_TOKEN: "r",
      PATH: "/usr/bin",
      HOME: "/home/runner",
      GITHUB_REPOSITORY: "o/r",
    });
    expect(env).toEqual({
      PATH: "/usr/bin",
      HOME: "/home/runner",
      GITHUB_REPOSITORY: "o/r",
    });
  });

  it("does not modify the env it was given", () => {
    const base = { INPUT_X: "1", PATH: "/bin" };
    childEnv(base);
    expect(base).toEqual({ INPUT_X: "1", PATH: "/bin" });
  });
});

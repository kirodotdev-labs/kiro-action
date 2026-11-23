import { describe, it, expect, mock, beforeEach } from "bun:test";

const inputs: Record<string, string> = {};
const maskedSecrets: string[] = [];
mock.module("@actions/core", () => ({
  setSecret: (value: string) => {
    maskedSecrets.push(value);
  },
  getInput: (name: string, _opts?: unknown) => {
    const val = inputs[name] ?? "";
    return val;
  },
  debug: () => {},
  info: () => {},
  warning: () => {},
}));

const { validateAuth } = await import("../src/utils/auth");

describe("validateAuth", () => {
  beforeEach(() => {
    Object.keys(inputs).forEach((k) => delete inputs[k]);
  });

  it("returns the api key when present", () => {
    inputs["kiro_api_key"] = "test-key-abc";
    expect(validateAuth()).toBe("test-key-abc");
  });

  it("registers the api key as a secret so logs mask it", () => {
    maskedSecrets.length = 0;
    inputs["kiro_api_key"] = "test-key-abc";
    validateAuth();
    expect(maskedSecrets).toEqual(["test-key-abc"]);
  });

  it("throws when key is empty string", () => {
    inputs["kiro_api_key"] = "";
    expect(() => validateAuth()).toThrow("kiro_api_key is empty");
  });

  it("throws when key is only whitespace", () => {
    inputs["kiro_api_key"] = "   ";
    expect(() => validateAuth()).toThrow("kiro_api_key is empty");
  });
});

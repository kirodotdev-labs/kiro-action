import { describe, it, expect } from "bun:test";
import {
  parseRequestedVersion,
  buildInstallScriptArgs,
} from "../src/setup/install-kiro";

describe("parseRequestedVersion", () => {
  it("treats empty input and 'latest' as latest", () => {
    expect(parseRequestedVersion("")).toBeUndefined();
    expect(parseRequestedVersion("  ")).toBeUndefined();
    expect(parseRequestedVersion("latest")).toBeUndefined();
    expect(parseRequestedVersion("LATEST")).toBeUndefined();
  });

  it("accepts a full semver, with or without a leading v", () => {
    expect(parseRequestedVersion("3.5.0")).toBe("3.5.0");
    expect(parseRequestedVersion("v2.37.1")).toBe("2.37.1");
    expect(parseRequestedVersion(" 3.0.0 ")).toBe("3.0.0");
  });

  it("rejects partial versions and ranges", () => {
    expect(() => parseRequestedVersion("3")).toThrow("Invalid kiro_version");
    expect(() => parseRequestedVersion("3.5")).toThrow("Invalid kiro_version");
    expect(() => parseRequestedVersion("^3.5.0")).toThrow(
      "Invalid kiro_version",
    );
  });

  it("rejects anything that could reach the shell", () => {
    expect(() => parseRequestedVersion("3.5.0; rm -rf ~")).toThrow(
      "Invalid kiro_version",
    );
    expect(() => parseRequestedVersion("$(whoami)")).toThrow(
      "Invalid kiro_version",
    );
  });
});

describe("buildInstallScriptArgs", () => {
  it("forces a non-interactive install without editing shell profiles", () => {
    expect(buildInstallScriptArgs(undefined)).toEqual([
      "--force",
      "--no-modify-path",
    ]);
  });

  it("pins the version when one is requested", () => {
    expect(buildInstallScriptArgs("2.37.1")).toEqual([
      "--force",
      "--no-modify-path",
      "--version",
      "2.37.1",
    ]);
  });
});

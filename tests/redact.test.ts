import { describe, it, expect } from "bun:test";
import { redact } from "../src/utils/redact";

describe("redact", () => {
  it("replaces every occurrence of each secret", () => {
    expect(redact("a SECRET-123456 b SECRET-123456", ["SECRET-123456"])).toBe(
      "a *** b ***",
    );
  });

  it("handles several secrets", () => {
    expect(
      redact("k=key-aaaaaaaa t=tok-bbbbbbbb", ["key-aaaaaaaa", "tok-bbbbbbbb"]),
    ).toBe("k=*** t=***");
  });

  it("matches secrets literally, not as patterns", () => {
    expect(redact("x a.b+c*d?e y", ["a.b+c*d?e"])).toBe("x *** y");
  });

  it("ignores empty, missing and too-short secrets", () => {
    expect(redact("hello abc", ["", undefined, "abc", "   "])).toBe(
      "hello abc",
    );
  });

  it("ignores surrounding whitespace on the secret", () => {
    expect(redact("v=secret-value-1", ["  secret-value-1\n"])).toBe("v=***");
  });
});

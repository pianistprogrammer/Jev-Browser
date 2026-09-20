import { describe, expect, it } from "vitest";
import { validateNavigationUrl } from "../src/policy/navigation.js";
import { redact } from "../src/policy/redaction.js";
describe("safety policy", () => {
  it("allows demo and https targets", () => {
    expect(validateNavigationUrl("https://example.com").hostname).toBe(
      "example.com",
    );
    expect(validateNavigationUrl("https://demo.jev.local/plans").hostname).toBe(
      "demo.jev.local",
    );
  });
  it("blocks private targets", () => {
    expect(() => validateNavigationUrl("http://127.0.0.1:8080")).toThrow();
    expect(() => validateNavigationUrl("https://127.0.0.1:8080")).toThrow();
    expect(() => validateNavigationUrl("https://192.168.1.1")).toThrow();
    expect(() => validateNavigationUrl("https://[::1]")).toThrow();
    expect(() => validateNavigationUrl("https://user:password@example.com")).toThrow();
  });
  it("redacts secret-shaped keys", () => {
    expect(redact({ token: "secret", nested: { password: "pw" } })).toEqual({
      token: "[REDACTED]",
      nested: { password: "[REDACTED]" },
    });
  });
});

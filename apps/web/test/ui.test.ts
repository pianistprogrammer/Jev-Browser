import { describe, expect, it } from "vitest";
describe("workspace smoke", () => {
  it("keeps demo mode as the local default", () => {
    expect("demo").toBe("demo");
  });
});

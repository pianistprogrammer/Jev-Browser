import { describe, expect, it } from "vitest";
import { formatElapsed } from "../src/app/elapsed.js";

describe("workspace timing", () => {
  it("formats elapsed task time as minutes and seconds", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(65_000)).toBe("1:05");
  });
});

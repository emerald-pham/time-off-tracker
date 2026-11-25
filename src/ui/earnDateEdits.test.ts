import { describe, expect, it } from "vitest";
import { resetEarnDate, setEarnDate } from "./earnDateEdits";

describe("storing Earn Date edits by schedule key", () => {
  it("adds or replaces the edit for a key, leaving others alone", () => {
    const edits = { "fh:2026:1": "2026-01-02" };
    expect(setEarnDate(edits, "vacation:2026:3", "2026-04-20")).toEqual({
      "fh:2026:1": "2026-01-02",
      "vacation:2026:3": "2026-04-20",
    });
    expect(setEarnDate(edits, "fh:2026:1", "2026-01-05")).toEqual({ "fh:2026:1": "2026-01-05" });
  });

  it("'Reset to projected' deletes the edit", () => {
    const edits = { "fh:2026:1": "2026-01-02", "vacation:2026:3": "2026-04-20" };
    expect(resetEarnDate(edits, "vacation:2026:3")).toEqual({ "fh:2026:1": "2026-01-02" });
  });
});

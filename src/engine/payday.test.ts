import { describe, expect, it } from "vitest";
import { payday } from "./index";

describe("Payday: the Thursday after the Payroll Week ends", () => {
  it("Tue Nov 18, 2025 is paid Thu Nov 27, 2025", () => {
    expect(payday("2025-11-18")).toBe("2025-11-27");
  });

  it("every day from Sun Sep 20 to Sat Sep 26, 2026 is paid Thu Oct 1, 2026", () => {
    for (const d of ["2026-09-20", "2026-09-23", "2026-09-26"]) {
      expect(payday(d)).toBe("2026-10-01");
    }
  });
});

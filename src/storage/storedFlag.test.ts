import { describe, expect, it } from "vitest";
import { memoryStorage, storedFlag } from "./index";

describe("storedFlag", () => {
  it("remembers yes and no, and knows when it was never set", () => {
    const storage = memoryStorage();
    const flag = storedFlag(() => storage, "made-up-flag");
    expect(flag.read()).toBeNull();
    flag.write(true);
    expect(storedFlag(() => storage, "made-up-flag").read()).toBe(true);
    flag.write(false);
    expect(flag.read()).toBe(false);
  });

  it("never throws when the browser blocks storage; it just forgets", () => {
    const flag = storedFlag(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    }, "made-up-flag");
    expect(() => flag.write(true)).not.toThrow();
    expect(flag.read()).toBeNull();
  });
});

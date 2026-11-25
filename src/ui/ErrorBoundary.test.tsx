// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary, PageError } from "./ErrorBoundary";
import { button, render, text } from "./testDom";
import type { Rendered } from "./testDom";

function Breaks({ when }: { when: boolean }) {
  if (when) throw new RangeError("Invalid time value");
  return <p>Fine</p>;
}

let mounted: Rendered | null = null;
afterEach(async () => {
  await mounted?.unmount();
  mounted = null;
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("shows the fallback instead of a blank page, and leaves the rest alone", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mounted = await render(
      <div>
        <ErrorBoundary fallback={(e) => <p>Couldn't show this: {e.message}</p>}>
          <Breaks when />
        </ErrorBoundary>
        <p>Settings still here</p>
      </div>,
    );
    expect(text(mounted.el)).toContain("Couldn't show this: Invalid time value");
    expect(text(mounted.el)).toContain("Settings still here");
  });

  it("tries again when its reset key changes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ui = (broken: boolean, key: number) => (
      <ErrorBoundary resetKey={key} fallback={() => <p>Broken</p>}>
        <Breaks when={broken} />
      </ErrorBoundary>
    );
    mounted = await render(ui(true, 1));
    expect(text(mounted.el)).toContain("Broken");
    await mounted.rerender(ui(false, 2));
    expect(text(mounted.el)).toContain("Fine");
  });

  it("the page-level fallback offers a reload", async () => {
    mounted = await render(<PageError error={new Error("Something odd")} />);
    expect(text(mounted.el)).toContain("Something went wrong: Something odd");
    expect(button(mounted.el, "Reload")).toBeTruthy();
  });
});

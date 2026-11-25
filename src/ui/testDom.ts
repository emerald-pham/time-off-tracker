/**
 * Test-only helpers for rendering components in jsdom. Test files that use
 * them start with `// @vitest-environment jsdom`.
 */
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface Rendered {
  el: HTMLElement;
  rerender(ui: ReactElement): Promise<void>;
  unmount(): Promise<void>;
}

export async function render(ui: ReactElement): Promise<Rendered> {
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => root.render(ui));
  await flush();
  return {
    el,
    rerender: async (next) => {
      await act(async () => root.render(next));
      await flush();
    },
    unmount: async () => {
      await act(async () => root.unmount());
      el.remove();
    },
  };
}

/**
 * For a test where a render error is expected: React reports it again on
 * `window` in development, and jsdom would print it. Returns the undo.
 */
export function expectRenderErrors(): () => void {
  const quiet = (e: ErrorEvent) => e.preventDefault();
  window.addEventListener("error", quiet);
  const log = console.error;
  console.error = () => {};
  return () => {
    window.removeEventListener("error", quiet);
    console.error = log;
  };
}

/** Lets pending promises, timers at 0 ms and React updates run. */
export async function flush(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

export const text = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ");

export function button(el: Element, label: string): HTMLButtonElement {
  const found = [...el.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
  if (!found) throw new Error(`No button "${label}" in: ${text(el)}`);
  return found;
}

export function maybeButton(el: Element, label: string): HTMLButtonElement | undefined {
  return [...el.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
}

/** The input inside the `<label>` whose caption is `caption`. */
export function field(el: Element, caption: string): HTMLInputElement {
  const label = [...el.querySelectorAll("label")].find(
    (l) => l.querySelector("span")?.textContent?.trim() === caption,
  );
  const input = label?.querySelector("input");
  if (!input) throw new Error(`No field "${caption}" in: ${text(el)}`);
  return input;
}

export function weekday(el: Element, label: string): HTMLInputElement {
  const found = [...el.querySelectorAll("label.weekday")].find((l) => l.textContent?.includes(label));
  const input = found?.querySelector("input");
  if (!input) throw new Error(`No weekday ${label}`);
  return input;
}

export async function click(target: HTMLElement): Promise<void> {
  await act(async () => target.click());
  await flush();
}

/** Types `value` into an input the way a person does, so React's onChange fires. */
export async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    input.focus();
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await flush();
}

/** Moves focus away from `input`, firing its onBlur. */
export async function leave(input: HTMLInputElement): Promise<void> {
  await act(async () => {
    input.focus();
    input.blur();
  });
  await flush();
}

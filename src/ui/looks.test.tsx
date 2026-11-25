// @vitest-environment jsdom
/**
 * How the app looks and moves (US-19, US-20, US-21, US-24). Layout can't be
 * measured in jsdom, so these check the CSS rules that do it, plus what the
 * components render. The pages were also checked by eye at 375 px and 1180 px.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { computeView } from "../engine";
import type { Occasion } from "../engine";
import { sam } from "../engine/fixtures";
import { LocalDataStore, memoryStorage } from "../storage";
import type { AppData } from "../storage";
import { App } from "./App";
import { LedgerPanel } from "./LedgerPanel";
import { AnimatedNumber, Reveal } from "./motion";
import { OccasionsPanel } from "./OccasionsPanel";
import { button, click, flush, render, text } from "./testDom";
import type { Rendered } from "./testDom";
/// <reference types="node" />
import { readFileSync } from "node:fs";

// Read from disk: Vitest hands stylesheets to tests empty.
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const styles = source("./styles.css");
const occasionsCss = source("./occasions.css");
const ledgerCss = source("./ledger.css");
const accountCss = source("./account.css");
const indexHtml = source("../../index.html");

const css = [styles, occasionsCss, ledgerCss, accountCss].join("\n");

/** The body of the first block (`@media …`, `@supports …` or a rule) whose prelude matches. */
function block(source: string, prelude: RegExp): string {
  const match = prelude.exec(source);
  if (!match) throw new Error(`No block ${prelude}`);
  const open = source.indexOf("{", match.index);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`Unclosed block ${prelude}`);
}

/** Every rule body in `source` whose selector list includes `selector`. */
function rules(source: string, selector: string): string[] {
  const found: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "");
  for (let m = re.exec(code); m; m = re.exec(code)) {
    if (m[1].split(",").some((s) => s.trim() === selector)) found.push(m[2]);
  }
  return found;
}

const px = (body: string, property: string) =>
  Number(new RegExp(`(?:^|;|\\s)${property}:\\s*(\\d+)px`).exec(body)?.[1] ?? NaN);

const mounted: Rendered[] = [];
afterEach(async () => {
  while (mounted.length) await mounted.pop()!.unmount();
  delete (window as { matchMedia?: unknown }).matchMedia;
  vi.unstubAllGlobals();
});

async function show(ui: React.ReactElement) {
  const r = await render(ui);
  mounted.push(r);
  return r.el;
}

/** Pretends the device has Reduce Motion on, or off. */
function reduceMotion(on: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes(on ? ": reduce" : ": no-preference"),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const TODAY = "2026-11-24";
const data: AppData = {
  settings: { ...sam, sapVacationHours: 40, sapFloatingHolidayHours: 8, sapAsOf: "2026-11-01" },
  occasions: [
    {
      id: "spring",
      name: "Made-up spring trip",
      start: "2027-03-01",
      end: "2027-03-04",
      dayTypes: { "2027-03-01": "vacation", "2027-03-02": "floatingHoliday", "2027-03-03": "unpaid", "2027-03-04": "rdo" },
    } satisfies Occasion,
  ],
  earnDateEdits: {},
};
const view = computeView({ ...data, today: TODAY });

const TYPES = ["vacation", "floating-holiday", "rdo", "unpaid"];
const SEASONS = ["winter", "spring", "summer", "autumn"];

describe("colors", () => {
  it("US-20: defines a color for each Day Type and Season, in light and in dark", () => {
    const light = rules(styles, ":root").join("\n");
    const dark = block(styles, /@media \(prefers-color-scheme: dark\)/);
    for (const name of [...TYPES, ...SEASONS]) {
      expect(light).toMatch(new RegExp(`--${name}:`));
      expect(light).toMatch(new RegExp(`--${name}-soft:`));
      expect(dark).toMatch(new RegExp(`--${name}:`));
      expect(dark).toMatch(new RegExp(`--${name}-soft:`));
    }
  });

  it("US-20: each Day Type and Season class uses its own color", () => {
    for (const name of [...TYPES, ...SEASONS]) {
      const prefix = TYPES.includes(name) ? "type" : "season";
      expect(rules(css, `.${prefix}-${name}`).join("")).toContain(`var(--${name})`);
    }
  });

  it("US-20: uses the same Day Type colors on the Ledger, the day editor and the PTO counts", async () => {
    const ledger = await show(
      <LedgerPanel ledger={view.ledger} configured hireDate={sam.hireDate} onEditEarnDate={vi.fn()} onResetEarnDate={vi.fn()} />,
    );
    expect(ledger.querySelector(".ledger .type-vacation")).not.toBeNull();
    expect(ledger.querySelector(".ledger .type-floating-holiday")).not.toBeNull();

    const occasions = await show(
      <OccasionsPanel data={data} today={TODAY} occasions={view.occasions} onChange={vi.fn()} />,
    );
    const counts = [...occasions.querySelectorAll(".occasion-card .chip")].map((c) => [c.className, text(c).trim()]);
    expect(counts).toEqual([
      ["chip type-vacation", "1 Vacation"],
      ["chip type-floating-holiday", "1 Floating Holiday"],
      ["chip type-rdo", "1 RDO"],
      ["chip type-unpaid", "+1 unpaid"],
    ]);
    await click(button(occasions, "Choose days"));
    const selects = [...occasions.querySelectorAll<HTMLSelectElement>(".day select")];
    expect(selects.map((s) => s.className)).toEqual([
      "type-select type-vacation",
      "type-select type-floating-holiday",
      "type-select type-unpaid",
      "type-select type-rdo",
    ]);
  });

  it("US-20: colors the Season by season", async () => {
    const el = await show(<OccasionsPanel data={data} today={TODAY} occasions={view.occasions} onChange={vi.fn()} />);
    const season = el.querySelector(".occasion-card .season-chip")!;
    expect(season.classList.contains("season-spring")).toBe(true);
    expect(text(season)).toContain("Spring 2027");
  });

  it("US-20: keeps the Ledger's Estimated italics and the approximate '*' obvious", () => {
    expect(rules(css, ".ledger .not-yet-earned button.earn-date-button").join("")).toContain("font-style: italic");
    expect(rules(css, ".approximate-mark").join("")).toMatch(/font-weight: [6-9]00/);
  });

  it("US-20: uses the system font stack, with no web fonts or outside stylesheets", () => {
    expect(rules(styles, ":root").join("")).toMatch(/font-family: -apple-system, BlinkMacSystemFont/);
    expect(css).not.toMatch(/@font-face|@import|url\(\s*["']?https?:/);
    expect(indexHtml).not.toMatch(/<link[^>]+href="https?:/);
    expect(indexHtml).not.toMatch(/<script[^>]+src="https?:/);
  });
});

describe("motion", () => {
  it("US-20: has animations, and turns all of them off under Reduce Motion", () => {
    expect(css).toMatch(/@keyframes/);
    expect(css).toMatch(/transition:/);
    const reduced = block(styles, /@media \(prefers-reduced-motion: reduce\)/);
    const everything = rules(reduced, "*");
    expect(everything.join("")).toContain("animation: none !important");
    expect(everything.join("")).toContain("transition: none !important");
    expect(rules(reduced, "*::before").length + rules(reduced, "*::after").length).toBe(2);
  });

  it("US-20: under Reduce Motion an editor closes at once and numbers jump straight to their value", async () => {
    reduceMotion(true);
    const r = await render(
      <>
        <Reveal open>Editor</Reveal>
        <AnimatedNumber value={3} />
      </>,
    );
    mounted.push(r);
    await r.rerender(
      <>
        <Reveal open={false}>Editor</Reveal>
        <AnimatedNumber value={9} />
      </>,
    );
    expect(text(r.el)).toBe("9");
    expect(r.el.querySelector(".reveal")).toBeNull();
  });

  it("US-20: otherwise an editor animates closed and a number counts up to its new value", async () => {
    reduceMotion(false);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const r = await render(
      <>
        <Reveal open>Editor</Reveal>
        <AnimatedNumber value={3} />
      </>,
    );
    mounted.push(r);
    expect(r.el.querySelector(".reveal.enter")).not.toBeNull();
    await r.rerender(
      <>
        <Reveal open={false}>Editor</Reveal>
        <AnimatedNumber value={9} />
      </>,
    );
    // The closing editor stays a moment to animate out, and can't be used meanwhile.
    const leaving = r.el.querySelector<HTMLElement>(".reveal.leave");
    expect(leaving?.textContent).toBe("Editor");
    expect(leaving?.hasAttribute("inert")).toBe(true);
    expect(r.el.querySelector(".count")?.textContent).toBe("3");

    const start = performance.now();
    await act(async () => frames.shift()!(start + 100));
    const midway = Number(r.el.querySelector(".count")?.textContent);
    expect(midway).toBeGreaterThan(3);
    expect(midway).toBeLessThan(9);
    await act(async () => {
      while (frames.length) frames.shift()!(start + 5000);
    });
    expect(r.el.querySelector(".count")?.textContent).toBe("9");

    await act(async () => new Promise((resolve) => setTimeout(resolve, 400)));
    await flush();
    expect(r.el.querySelector(".reveal")).toBeNull();
  });
});

describe("fits an iPhone", () => {
  it("US-19: keeps the iOS date-field fix, so date fields stay inside their card", () => {
    const ios = block(styles, /@supports \(-webkit-touch-callout: none\)/);
    const dateInput = rules(ios, 'input[type="date"]').join("");
    expect(dateInput).toContain("min-width: 0");
    expect(dateInput).toContain("max-width: 100%");
    expect(dateInput).toContain("-webkit-appearance: none");
  });

  it("US-19: uses 16 px text in every field, so Safari doesn't zoom", () => {
    for (const selector of ['.field input[type="date"]', ".occasions select", '.occasions input[type="text"]']) {
      const body = rules(css, selector).join(";");
      expect(px(body, "font-size"), selector).toBe(16);
    }
  });

  it("US-19: lets cards shrink and long names wrap instead of overflowing", () => {
    expect(rules(styles, ".panel").join("")).toContain("min-width: 0");
    expect(rules(occasionsCss, ".occasion-card").join("")).toContain("min-width: 0");
    expect(rules(occasionsCss, ".occasion-name").join("")).toContain("overflow-wrap: anywhere");
    expect(rules(occasionsCss, ".occasion-actions").join("")).toContain("flex-wrap: wrap");
  });
});

describe("touch targets", () => {
  it("US-24: Occasion buttons and fields are at least 44 px tall", () => {
    for (const selector of [".occasion-actions button", ".occasions .actions button", ".occasions select"]) {
      const body = rules(occasionsCss, selector).join(";");
      expect(px(body, "min-height"), selector).toBeGreaterThanOrEqual(44);
    }
  });
});

describe("layout", () => {
  it("US-21: three columns on wide screens (Ledger, Occasions, Settings), tabs on phones", async () => {
    const wide = block(styles, /@media \(min-width: 1024px\)/);
    expect(rules(wide, ".tabs").join("")).toContain("display: none");
    const columns = /grid-template-columns:([^;]+);/.exec(rules(wide, ".columns").join(""))?.[1] ?? "";
    expect(columns.trim().split(/\s+(?![^(]*\))/)).toHaveLength(3);

    const storage = memoryStorage();
    await new LocalDataStore(storage).save(data);
    const el = await show(<App store={new LocalDataStore(storage)} />);
    expect([...el.querySelectorAll('[role="tab"]')].map((t) => text(t).trim())).toEqual([
      "Ledger",
      "Occasions",
      "Settings",
    ]);
    expect([...el.querySelectorAll('[role="tabpanel"]')].map((p) => p.id)).toEqual([
      "panel-ledger",
      "panel-occasions",
      "panel-settings",
    ]);
  });
});

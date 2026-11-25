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
const bokehCss = source("./bokeh.css");
const indexHtml = source("../../index.html");
const mainTsx = source("../main.tsx");

const css = [styles, occasionsCss, ledgerCss, accountCss].join("\n");

const stripComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, "");

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

  it("US-20: the approximate '*' is muted, and dates read as tappable without a dotted underline", () => {
    expect(rules(css, ".approximate-mark").join("")).toContain("color: var(--muted)");
    const date = rules(css, ".ledger button.earn-date-button").join("");
    expect(date).toContain("color: var(--accent-2)");
    expect(date).not.toMatch(/text-decoration/);
  });
});

// ---- Contrast (WCAG 2.x relative luminance) ----

type Rgb = [number, number, number];

const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

function luminance(c: Rgb): number {
  const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `top` at `alpha` over `under`. */
const over = (top: Rgb, alpha: number, under: Rgb): Rgb =>
  top.map((c, i) => Math.round(c * alpha + under[i] * (1 - alpha))) as Rgb;

/** The custom properties declared in `body`. */
const tokensIn = (body: string): Record<string, string> =>
  Object.fromEntries([...stripComments(body).matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

/** A color scheme's tokens, from styles.css and bokeh.css. */
function scheme(dark: boolean): Record<string, string> {
  const of = (source: string) => {
    // The first `:root` rule is the light one; the dark one is inside its `@media`.
    const light = tokensIn(rules(source, ":root")[0]);
    if (!dark) return light;
    return { ...light, ...tokensIn(rules(block(source, /@media \(prefers-color-scheme: dark\)/), ":root").join("\n")) };
  };
  return { ...of(styles), ...of(bokehCss) };
}

/** Text tokens and the solid surfaces each is drawn on. */
const SOLID_PAIRS: [string, string[]][] = [
  ["--text", ["--bg", "--surface", "--surface-2", "--year-bg"]],
  ["--muted", ["--bg", "--surface", "--surface-2", "--year-bg"]],
  ["--accent", ["--surface", "--surface-2"]],
  ["--accent-2", ["--surface", "--surface-2", "--year-bg"]],
  ["--ok", ["--ok-soft", "--surface"]],
  ["--warn", ["--warn-soft", "--surface"]],
  ["--danger", ["--danger-soft", "--surface", "--surface-2"]],
  // Light text on a filled button: "Yes, delete" and "Use Floating Holidays".
  ["--surface", ["--danger", "--floating-holiday"]],
  ...TYPES.map((t): [string, string[]] => [`--${t}`, [`--${t}-soft`, "--surface", "--surface-2"]]),
  ...SEASONS.map((s): [string, string[]] => [`--${s}`, [`--${s}-soft`]]),
];

/** Text drawn straight on a panel, which lets the bokeh glow through a little. */
const ON_PANEL = ["--text", "--muted", "--accent", "--accent-2", "--danger", "--vacation", "--floating-holiday"];

describe("readability", () => {
  it("US-20: text stays readable (WCAG AA 4.5:1) on the surface it sits on, in light and in dark", () => {
    for (const dark of [false, true]) {
      const t = scheme(dark);
      const name = dark ? "dark" : "light";
      const color = (token: string): Rgb => {
        expect(t[token], `${name} ${token}`).toMatch(/^#[0-9a-f]{6}$/i);
        return rgb(t[token]);
      };
      const check = (fg: string, bg: Rgb, where: string) =>
        expect(contrast(color(fg), bg), `${name}: ${fg} on ${where}`).toBeGreaterThanOrEqual(4.5);

      for (const [fg, bgs] of SOLID_PAIRS) for (const bg of bgs) check(fg, color(bg), bg);

      // The page: its background and corner glows, under one bokeh orb or two overlapping.
      const alpha = Number(t["--orb-alpha"]);
      const orbs = Object.keys(t)
        .filter((k) => k.startsWith("--orb-") && k !== "--orb-alpha")
        .map(color);
      expect(orbs.length).toBeGreaterThanOrEqual(4);
      const page: Rgb[] = [];
      for (const base of ["--bg", "--glow-1", "--glow-2"].map(color)) {
        page.push(base);
        for (const a of orbs) {
          page.push(over(a, alpha, base));
          for (const b of orbs) page.push(over(a, alpha, over(b, alpha, base)));
        }
      }
      // Only full-strength text sits right on the page (the loading line).
      page.forEach((bg) => check("--text", bg, `the page rgb(${bg})`));
      expect(rules(css, ".app > .account-status").join("")).toContain("color: var(--text)");

      // Panels: the surface at --panel-alpha over any of those.
      const panelAlpha = parseFloat(t["--panel-alpha"]) / 100;
      expect(panelAlpha).toBeGreaterThanOrEqual(0.85);
      const panels = page.map((bg) => over(color("--surface"), panelAlpha, bg));
      for (const fg of ON_PANEL) panels.forEach((bg) => check(fg, bg, `a panel rgb(${bg})`));

      // The tab bar: the surface, a little see-through.
      const tabsAlpha = Number(/color-mix\(in srgb, var\(--surface\) (\d+)%/.exec(rules(styles, ".tabs").join(""))![1]) / 100;
      const tabs = page.map((bg) => over(color("--surface"), tabsAlpha, bg));
      for (const fg of ["--text", "--muted"]) tabs.forEach((bg) => check(fg, bg, `the tab bar rgb(${bg})`));
    }
  });

  it("US-20: panels fall back to a solid surface where the blur isn't supported", () => {
    expect(rules(styles, ".panel").join("")).toContain(
      "background: color-mix(in srgb, var(--surface) var(--panel-alpha), transparent)",
    );
    const fallback = block(styles, /@supports not \(\(-webkit-backdrop-filter: blur\(1px\)\) or \(backdrop-filter: blur\(1px\)\)\)/);
    expect(rules(fallback, ".panel").join("")).toContain("background: var(--surface)");
  });
});

describe("the bokeh background", () => {
  const page = new DOMParser().parseFromString(indexHtml, "text/html");
  const keyframes = () =>
    [...stripComments(bokehCss).matchAll(/@keyframes\s+([\w-]+)/g)].map((m) =>
      block(bokehCss, new RegExp(`@keyframes ${m[1]}\\b`)),
    );

  it("US-20: a soft bokeh layer renders behind the app, hidden from screen readers and taps", () => {
    const layer = page.querySelector(".bokeh")!;
    expect(layer).not.toBeNull();
    expect(layer.getAttribute("aria-hidden")).toBe("true");
    expect(layer.parentElement).toBe(page.body);
    // Before the app, so it paints underneath even before the app loads.
    expect(layer.compareDocumentPosition(page.getElementById("root")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const orbs = layer.querySelectorAll(".orb").length;
    expect(orbs).toBeGreaterThanOrEqual(4);
    expect(orbs).toBeLessThanOrEqual(6);
    expect(mainTsx).toContain('import "./ui/bokeh.css"');

    const body = rules(bokehCss, ".bokeh").join("");
    expect(body).toContain("position: fixed");
    expect(body).toContain("pointer-events: none");
    expect(body).toMatch(/z-index: -1/);

    // Huge, diffuse orbs fading to transparent.
    const orb = rules(bokehCss, ".orb").join("");
    expect(orb).toContain("radial-gradient(circle, var(--orb-color) 0%, transparent 70%)");
    expect(orb).toContain("will-change: transform");
    const sizes = [...bokehCss.matchAll(/--orb-size:\s*(\d+)vmax/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBe(orbs);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(50);
    for (const size of sizes) expect(size).toBeLessThanOrEqual(90);
  });

  it("US-20: the orbs drift slowly, animating only transform and opacity", () => {
    expect(keyframes().length).toBeGreaterThanOrEqual(2);
    for (const frames of keyframes()) {
      for (const [, property] of frames.matchAll(/([\w-]+)\s*:/g)) expect(["transform", "opacity"]).toContain(property);
    }
    const durations = [...bokehCss.matchAll(/animation:[^;]*?(\d+)s\b/g)].map((m) => Number(m[1]));
    expect(durations.length).toBeGreaterThanOrEqual(4);
    for (const s of durations) expect(s).toBeGreaterThanOrEqual(30);
    for (const s of durations) expect(s).toBeLessThanOrEqual(90);
  });

  it("US-20: under Reduce Motion the orbs hold still, and a paused orb is already in place", () => {
    const reduced = block(bokehCss, /@media \(prefers-reduced-motion: reduce\)/);
    expect(rules(reduced, ".orb").join("")).toContain("animation: none");
    for (const frames of keyframes()) {
      // Each loop starts where the orb rests, so stopping it anywhere at the start changes nothing.
      expect(frames).toMatch(/0%,\s*100% \{\s*transform: none;\s*(?:opacity: var\(--orb-alpha\);\s*)?\}/);
      // Never brighter than the orbs' resting strength, which the contrast test checks.
      for (const [, value] of frames.matchAll(/opacity:\s*([^;]+);/g)) expect(value).toContain("var(--orb-alpha)");
    }
  });
});

describe("motion", () => {
  it("US-20: entrance animations never hold content hidden: no `both` fill, and page-level ones start at once", () => {
    const code = stripComments(css);
    for (const [, animation] of code.matchAll(/animation:\s*([^;]+);/g)) expect(animation).not.toMatch(/\bboth\b/);
    const wide = block(styles, /@media \(min-width: 1024px\)/);
    for (const selector of [".app-header", ".panel.active", ".handoff", ".app-error"]) {
      const body = rules(css, selector).join("");
      expect(body, selector).toMatch(/animation: [\w-]+ [\d.]+s .*backwards;/);
      expect(body, selector).not.toContain("animation-delay");
    }
    expect(rules(wide, ".panel").join("")).toContain("backwards");
    expect(wide).not.toContain("animation-delay");
  });

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
    expect(rules(ledgerCss, ".row-detail").join("")).toContain("overflow-wrap: anywhere");
  });

  const ledgerEl = () =>
    show(<LedgerPanel ledger={view.ledger} configured hireDate={sam.hireDate} onEditEarnDate={vi.fn()} onResetEarnDate={vi.fn()} />);

  it("US-19: the Ledger is a list grouped by year, not a three-column table", async () => {
    const el = await ledgerEl();
    expect(el.querySelector("table")).toBeNull();
    const groups = [...el.querySelectorAll(".ledger > .year-group")];
    expect(groups.map((g) => text(g.querySelector(".year-label")!))).toEqual(view.ledger.groups.map((g) => String(g.year)));
    for (const group of groups) expect(group.querySelector(":scope > ol.ledger-rows")).not.toBeNull();
    const rows = el.querySelectorAll("ol.ledger-rows > li.row[data-key]");
    expect(rows.length).toBe(view.ledger.groups.reduce((n, g) => n + g.rows.length, 0));
  });

  it("US-19: each row's date and type label share one line, with the Occasion on its own line beneath", async () => {
    const el = await ledgerEl();
    for (const row of el.querySelectorAll("li.row")) {
      const line = row.querySelector(":scope > .row-line")!;
      expect(line.querySelector("button.earn-date-button")).not.toBeNull();
      expect(line.querySelector(".type-label")).not.toBeNull();
      expect(text(line)).not.toContain("Made-up spring trip");
    }
    const used = [...el.querySelectorAll("li.row")].filter((r) => text(r).includes("Made-up spring trip"));
    expect(used.length).toBeGreaterThan(0);
    for (const row of used) expect(text(row.querySelector(":scope > .row-detail")!)).toBe("Made-up spring trip");

    // On a phone the line is a row of its own: the date left, the type right, neither wrapping inside.
    const line = rules(ledgerCss, ".row-line").join("");
    expect(line).toContain("display: flex");
    expect(line).toContain("justify-content: space-between");
    expect(rules(ledgerCss, ".ledger .type-label").join("")).toContain("white-space: nowrap");
    expect(rules(ledgerCss, ".ledger button.earn-date-button").join("")).toContain("white-space: nowrap");
    // Only a Ledger 600 px wide or more lines rows up in columns.
    const wide = block(ledgerCss, /@container \(min-width: 600px\)/);
    expect(rules(wide, ".row-line").join("")).toContain("display: contents");
    expect(rules(ledgerCss, ".ledger").join("")).toContain("container-type: inline-size");
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

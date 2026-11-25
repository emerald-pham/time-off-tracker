/**
 * The app's small bits of JavaScript motion: editors that animate closed and
 * numbers that count to a new value. Everything else moves in CSS. Both stop
 * when the device has Reduce Motion on, as the CSS does (US-20), and where the
 * browser can't say (jsdom), so tests see the end state at once.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/** How long an editor takes to animate closed; matches `reveal-out` in styles.css. */
const LEAVE_MS = 200;
/** How long a number takes to count to its new value. */
const COUNT_MS = 600;

/** True when the device hasn't asked for reduced motion. */
export function motionAllowed(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: no-preference)").matches
  );
}

/**
 * Shows `children` while `open`, sliding open, and slides closed when `open`
 * turns false, keeping the last content on screen (and unusable) meanwhile.
 */
export function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  const last = useRef<ReactNode>(children);
  const wasOpen = useRef(open);
  const [leaving, setLeaving] = useState(false);
  if (open) last.current = children;

  // A layout effect, so the closing copy is on screen before the browser paints.
  useLayoutEffect(() => {
    const closed = wasOpen.current && !open;
    wasOpen.current = open;
    if (!closed || !motionAllowed()) {
      setLeaving(false);
      return;
    }
    setLeaving(true);
    const timer = setTimeout(() => setLeaving(false), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [open]);

  if (open) {
    return (
      <div className="reveal enter">
        <div className="reveal-inner">{children}</div>
      </div>
    );
  }
  if (!leaving || !motionAllowed()) return null;
  return (
    // React 18 passes `inert` through only as a string.
    <div className="reveal leave" {...{ inert: "" }} aria-hidden="true">
      <div className="reveal-inner">{last.current}</div>
    </div>
  );
}

/** A count that rolls to its new value when it changes, with a little pop. */
export function AnimatedNumber({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const [pops, setPops] = useState(0);
  const current = useRef(value);

  useEffect(() => {
    const from = current.current;
    if (from === value) return;
    if (!motionAllowed() || typeof requestAnimationFrame !== "function") {
      current.current = value;
      setShown(value);
      return;
    }
    setPops((n) => n + 1);
    let frame = 0;
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / COUNT_MS);
      const eased = 1 - (1 - progress) ** 3;
      current.current = Math.round(from + (value - from) * eased);
      setShown(current.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <span key={pops} className={pops > 0 ? "count pop" : "count"}>
      {motionAllowed() ? shown : value}
    </span>
  );
}

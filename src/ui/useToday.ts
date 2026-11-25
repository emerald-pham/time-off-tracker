import { useEffect, useState } from "react";
import type { IsoDate } from "../engine";

/** Today in the device's time zone, as an ISO date. */
export function localToday(now = new Date()): IsoDate {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Milliseconds from `now` to the next local midnight. */
function untilMidnight(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
}

/**
 * Today, kept current while the page stays open: it moves on at local
 * midnight, and catches up whenever the page comes back into view or gets
 * focus, since timers don't run while a phone sleeps.
 */
export function useToday(): IsoDate {
  const [today, setToday] = useState(() => localToday());

  useEffect(() => {
    const refresh = () => setToday(localToday());
    let timer: ReturnType<typeof setTimeout>;
    const atMidnight = () => {
      timer = setTimeout(() => {
        refresh();
        atMidnight();
      }, untilMidnight(new Date()) + 1000);
    };
    const onVisible = () => {
      if (document.visibilityState !== "hidden") refresh();
    };
    atMidnight();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, []);

  return today;
}

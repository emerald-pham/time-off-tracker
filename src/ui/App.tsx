import { useEffect, useMemo, useState } from "react";
import { computeView } from "../engine";
import type { IsoDate } from "../engine";
import { emptyAppData, sameAppData } from "../storage";
import type { AppData, DataStore } from "../storage";
import { resetEarnDate, setEarnDate } from "./earnDateEdits";
import { ErrorBoundary } from "./ErrorBoundary";
import { LedgerPanel } from "./LedgerPanel";
import { OccasionsPanel } from "./OccasionsPanel";
import { SettingsPanel } from "./SettingsPanel";

type Section = "ledger" | "occasions" | "settings";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "ledger", label: "Ledger" },
  { id: "occasions", label: "Occasions" },
  { id: "settings", label: "Settings" },
];

/** Today in the device's time zone, as an ISO date. */
function localToday(): IsoDate {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * `account` is the Settings "Account" section, rendered below the settings.
 *
 * The data on screen follows the store live, so edits made on another tab or
 * device show up here, and each edit saves only what it changed.
 *
 * Nothing here leaves a blank page: while loading, when the data can't load,
 * or when the Ledger can't be worked out, the page says so and the Account
 * section (and Settings, where there's data) stays reachable.
 */
export function App({ store, account }: { store: DataStore; account?: React.ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [tab, setTab] = useState<Section>("settings");
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notKept, setNotKept] = useState(false);
  const today = localToday();

  useEffect(() => {
    let first = true;
    return store.subscribe(
      ({ data: stored, notKept: lost }) => {
        const next = stored ?? emptyAppData();
        setData((current) => (current && sameAppData(current, next) ? current : next));
        setLoadError(null);
        setNotKept(lost);
        if (first) {
          first = false;
          // On first run, with no hire date yet, open on Settings.
          setTab(next.settings.hireDate ? "ledger" : "settings");
        }
      },
      (e) => (first ? setLoadError(e) : setSaveError(e.message)),
    );
  }, [store]);

  const computed = useMemo(() => {
    if (!data) return null;
    try {
      return { view: computeView({ ...data, today }), error: null };
    } catch (e) {
      return { view: null, error: e instanceof Error ? e : new Error(String(e)) };
    }
  }, [data, today]);

  if (!data || !computed) {
    return (
      <div className="app">
        <AppHeader />
        {loadError ? (
          <>
            <p className="app-error" role="alert">
              Couldn't load your data: {loadError.message}
            </p>
            <p>
              <button type="button" className="button primary" onClick={() => window.location.reload()}>
                Reload
              </button>
            </p>
          </>
        ) : (
          <p className="account-status">Loading your data…</p>
        )}
        {account}
      </div>
    );
  }

  const { view } = computed;
  const update = (next: AppData) => {
    const before = data;
    setData(next);
    setSaveError(null);
    store.update(before, next).catch((e: unknown) => setSaveError(`Couldn't save that change: ${message(e)}`));
  };
  const cantShow = (what: string) => (error: Error) => (
    <p className="app-error" role="alert">
      Couldn't work out your {what}: {error.message}. Check your Settings.
    </p>
  );

  return (
    <div className="app">
      <AppHeader />
      {notKept && (
        <p className="app-notice" role="status">
          This browser isn't letting the app save, so your changes only last until you close this page.
        </p>
      )}
      {saveError && (
        <p className="app-error" role="alert">
          {saveError}
        </p>
      )}

      <nav className="tabs" role="tablist" aria-label="Sections">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            role="tab"
            id={`tab-${s.id}`}
            aria-controls={`panel-${s.id}`}
            aria-selected={tab === s.id}
            className={tab === s.id ? "tab active" : "tab"}
            onClick={() => setTab(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <main className="columns">
        <Panel id="ledger" active={tab}>
          {view ? (
            <ErrorBoundary resetKey={data} fallback={cantShow("Ledger")}>
              <LedgerPanel
                ledger={view.ledger}
                configured={view.configured}
                hireDate={data.settings.hireDate}
                onEditEarnDate={(key, date) =>
                  update({ ...data, earnDateEdits: setEarnDate(data.earnDateEdits, key, date) })
                }
                onResetEarnDate={(key) =>
                  update({ ...data, earnDateEdits: resetEarnDate(data.earnDateEdits, key) })
                }
              />
            </ErrorBoundary>
          ) : (
            cantShow("Ledger")(computed.error)
          )}
        </Panel>
        <Panel id="occasions" active={tab}>
          {view ? (
            <ErrorBoundary resetKey={data} fallback={cantShow("Occasions")}>
              <OccasionsPanel
                data={data}
                today={today}
                occasions={view.occasions}
                onChange={(occasions) => update({ ...data, occasions })}
              />
            </ErrorBoundary>
          ) : (
            cantShow("Occasions")(computed.error)
          )}
        </Panel>
        <Panel id="settings" active={tab}>
          <ErrorBoundary resetKey={data} fallback={cantShow("Settings")}>
            <SettingsPanel
              settings={data.settings}
              today={today}
              onChange={(settings) => update({ ...data, settings })}
            />
          </ErrorBoundary>
          {account}
        </Panel>
      </main>
    </div>
  );
}

export function AppHeader() {
  return (
    <header className="app-header">
      <h1>Time Off Tracker</h1>
      <p className="label">IATSE Local 631 Regular Full Time (Entertainment Technicians, Costuming, Cosmetology)</p>
      <p className="disclaimer">Estimates only. SAP is the official record.</p>
    </header>
  );
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function Panel({ id, active, children }: { id: Section; active: Section; children: React.ReactNode }) {
  const label = SECTIONS.find((s) => s.id === id)!.label;
  return (
    <section
      id={`panel-${id}`}
      role="tabpanel"
      aria-labelledby={`tab-${id}`}
      className={id === active ? "panel active" : "panel"}
    >
      <h2 className="panel-title">{label}</h2>
      {children}
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import { computeView } from "../engine";
import type { IsoDate } from "../engine";
import { emptyAppData } from "../storage";
import type { AppData, DataStore } from "../storage";
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

export function App({ store }: { store: DataStore }) {
  const [data, setData] = useState<AppData | null>(null);
  const [tab, setTab] = useState<Section>("settings");
  const today = localToday();

  useEffect(() => {
    store.load().then((loaded) => {
      const initial = loaded ?? emptyAppData();
      setData(initial);
      // On first run, with no hire date yet, open on Settings.
      setTab(initial.settings.hireDate ? "ledger" : "settings");
    });
  }, [store]);

  const view = useMemo(
    () => data && computeView({ ...data, today }),
    [data, today],
  );

  if (!data || !view) return null;

  const update = (next: AppData) => {
    setData(next);
    void store.save(next);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Time Off Tracker</h1>
        <p className="label">
          IATSE Local 631 Regular Full Time (Entertainment Technicians, Costuming, Cosmetology)
        </p>
        <p className="disclaimer">Estimates only. SAP is the official record.</p>
      </header>

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
          <LedgerPanel ledger={view.ledger} configured={view.configured} />
        </Panel>
        <Panel id="occasions" active={tab}>
          <OccasionsPanel />
        </Panel>
        <Panel id="settings" active={tab}>
          <SettingsPanel
            settings={data.settings}
            today={today}
            onChange={(settings) => update({ ...data, settings })}
          />
        </Panel>
      </main>
    </div>
  );
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

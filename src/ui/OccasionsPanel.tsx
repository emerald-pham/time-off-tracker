import { Fragment, useState } from "react";
import { FIRST_SUPPORTED_YEAR, LAST_SUPPORTED_YEAR, isSupportedDate } from "../engine";
import type { DayType, IsoDate, Occasion, OccasionView } from "../engine";
import type { AppData } from "../storage";
import { DAY_TYPE_LABELS, formatDayOff, formatRange, seasonLabel } from "./format";
import { checkOccasion, withRange, withResolvedTypes } from "./occasionEdits";
import "./occasions.css";

const DAY_TYPES: DayType[] = ["rdo", "floatingHoliday", "vacation", "unpaid"];

interface Props {
  data: AppData;
  today: IsoDate;
  /** From the engine, sorted by start date. */
  occasions: OccasionView[];
  onChange: (occasions: Occasion[]) => void;
}

/** What's open: one Occasion's day editor or details form, or a new Occasion's day editor. */
type Editing =
  | { kind: "days"; draft: Occasion; isNew: boolean; highlight: IsoDate[]; messages: string[] }
  | { kind: "details"; draft: Occasion; messages: string[] };

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function OccasionsPanel({ data, today, occasions, onChange }: Props) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const stored = (id: string) => data.occasions.find((o) => o.id === id)!;

  /** Saves `candidate` unless it Clashes; returns the messages when refused. */
  const trySave = (candidate: Occasion): { messages: string[]; highlight: IsoDate[] } | null => {
    const check = checkOccasion(data, today, candidate);
    if (check.clashes.length > 0) {
      return { messages: check.messages, highlight: check.clashes.map((c) => c.date) };
    }
    const saved = withResolvedTypes(candidate, check.view);
    onChange([...data.occasions.filter((o) => o.id !== saved.id), saved]);
    return null;
  };

  const add = (name: string, start: IsoDate, end: IsoDate) => {
    const draft: Occasion = { id: newId(), name, start, end, dayTypes: {} };
    const refused = trySave(draft);
    if (refused) {
      // A new Occasion's defaults Clash: open its day editor with the clashing dates highlighted.
      const view = checkOccasion(data, today, draft).view;
      setEditing({ kind: "days", draft: withResolvedTypes(draft, view), isNew: true, ...refused });
      return false;
    }
    return true;
  };

  const newDraft = editing?.kind === "days" && editing.isNew ? editing : null;

  return (
    <div className="occasions">
      <AddOccasionForm onAdd={add} disabled={newDraft !== null} />

      {newDraft && (
        <div className="new-draft">
          <p className="draft-title">
            New: <strong>{newDraft.draft.name}</strong> · {formatRange(newDraft.draft.start, newDraft.draft.end)}
          </p>
          <DayEditor
            editing={newDraft}
            deducted={new Set()}
            onChange={setEditing}
            onSave={(draft) => {
              const refused = trySave(draft);
              setEditing(refused ? { ...newDraft, draft, ...refused } : null);
            }}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {occasions.length === 0 && !newDraft ? (
        <p className="empty">No Occasions yet.</p>
      ) : (
        occasions.length > 0 && (
          <table className="occasion-table">
            <thead>
              <tr>
                <th scope="col">Occasion</th>
                <th scope="col">Dates</th>
                <th scope="col">PTO Days</th>
                <th scope="col">Season</th>
              </tr>
            </thead>
            <tbody>
              {occasions.map((o) => {
                const open = editing && !("isNew" in editing && editing.isNew) && editing.draft.id === o.id ? editing : null;
                return (
                  <Fragment key={o.id}>
                    <tr className={o.deducted ? "occasion deducted" : "occasion"}>
                      <td>
                        <button
                          type="button"
                          className="link"
                          aria-label={`Edit ${o.name}`}
                          onClick={() =>
                            setEditing(open?.kind === "details" ? null : { kind: "details", draft: stored(o.id), messages: [] })
                          }
                        >
                          {o.name}
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="caret-button"
                          aria-expanded={open?.kind === "days"}
                          aria-label={`Day Types for ${o.name}`}
                          onClick={() =>
                            setEditing(
                              open?.kind === "days"
                                ? null
                                : {
                                    kind: "days",
                                    draft: withResolvedTypes(stored(o.id), o),
                                    isNew: false,
                                    highlight: [],
                                    messages: [],
                                  },
                            )
                          }
                        >
                          <span className="dates">
                            {/* Each date stays whole; the line may break after the dash. */}
                            {formatRange(o.start, o.end)
                              .split(" – ")
                              .map((part, i, all) => (
                                <Fragment key={i}>
                                  {i > 0 && " "}
                                  <span className="date">{i < all.length - 1 ? `${part} –` : part}</span>
                                </Fragment>
                              ))}
                          </span>
                          <span className="caret" aria-hidden="true">
                            {open?.kind === "days" ? "▾" : "▸"}
                          </span>
                        </button>
                      </td>
                      <td className="pto">
                        {o.ptoDays}
                        {o.unpaid > 0 && <span className="note"> +{o.unpaid} unpaid</span>}
                        {o.short > 0 && <span className="short"> short by {o.short}</span>}
                      </td>
                      <td className="season">{seasonLabel(o.season)}</td>
                    </tr>
                    {open && (
                      <tr className="editor-row">
                        <td colSpan={4}>
                          {open.kind === "days" ? (
                            <DayEditor
                              editing={open}
                              deducted={new Set(o.days.filter((d) => d.deducted).map((d) => d.date))}
                              onChange={setEditing}
                              onSave={(draft) => {
                                const refused = trySave(draft);
                                setEditing(refused ? { ...open, draft, ...refused } : null);
                              }}
                              onCancel={() => setEditing(null)}
                            />
                          ) : (
                            <DetailsEditor
                              editing={open}
                              onChange={setEditing}
                              onSave={(draft) => {
                                const refused = trySave(draft);
                                setEditing(refused ? { ...open, draft, messages: refused.messages } : null);
                              }}
                              onDelete={() => {
                                if (!window.confirm(`Delete '${o.name}'?`)) return;
                                onChange(data.occasions.filter((x) => x.id !== o.id));
                                setEditing(null);
                              }}
                              onCancel={() => setEditing(null)}
                            />
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}

const FIRST_DATE = `${FIRST_SUPPORTED_YEAR}-01-01`;
const LAST_DATE = `${LAST_SUPPORTED_YEAR}-12-31`;
const DATE_RANGE_MESSAGE = `Enter dates between ${FIRST_SUPPORTED_YEAR} and ${LAST_SUPPORTED_YEAR}.`;

/** Both dates real and from 1950 to 2100; an empty end means a one-day Occasion. */
const datesSupported = (start: IsoDate, end: IsoDate) => isSupportedDate(start) && (end === "" || isSupportedDate(end));

function AddOccasionForm({
  onAdd,
  disabled,
}: {
  onAdd: (name: string, start: IsoDate, end: IsoDate) => boolean;
  disabled: boolean;
}) {
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [messages, setMessages] = useState<string[]>([]);

  return (
    <form
      className="add-occasion"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || !start) return;
        if (!datesSupported(start, end)) {
          setMessages([DATE_RANGE_MESSAGE]);
          return;
        }
        setMessages([]);
        const last = end && end >= start ? end : start;
        // Clear the form either way: a Clash opens the new Occasion's day editor instead.
        onAdd(name.trim(), start, last);
        setName("");
        setStart("");
        setEnd("");
      }}
    >
      <Messages messages={messages} />
      <label className="field name">
        <span>Occasion</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required />
      </label>
      <label className="field">
        <span>Start</span>
        <input
          type="date"
          value={start}
          min={FIRST_DATE}
          max={LAST_DATE}
          onChange={(e) => setStart(e.target.value)}
          required
        />
      </label>
      <label className="field">
        <span>End</span>
        <input
          type="date"
          value={end}
          min={start || FIRST_DATE}
          max={LAST_DATE}
          onChange={(e) => setEnd(e.target.value)}
        />
      </label>
      <button type="submit" className="primary" disabled={disabled}>
        Add
      </button>
    </form>
  );
}

function Messages({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <div className="clash-messages" role="alert">
      {messages.map((m) => (
        <p key={m}>{m}</p>
      ))}
    </div>
  );
}

function DayEditor({
  editing,
  deducted,
  onChange,
  onSave,
  onCancel,
}: {
  editing: Extract<Editing, { kind: "days" }>;
  deducted: Set<IsoDate>;
  onChange: (e: Editing) => void;
  onSave: (draft: Occasion) => void;
  onCancel: () => void;
}) {
  const { draft } = editing;
  const dates = Object.keys(draft.dayTypes).sort();
  const setType = (date: IsoDate, type: DayType) =>
    onChange({ ...editing, draft: { ...draft, dayTypes: { ...draft.dayTypes, [date]: type } } });

  return (
    <div className="day-editor">
      <Messages messages={editing.messages} />
      <ul className="day-list">
        {dates.map((date) => {
          const classes = [
            "day",
            deducted.has(date) && "deducted",
            editing.highlight.includes(date) && "clashing",
          ].filter(Boolean);
          return (
            <li key={date} className={classes.join(" ")}>
              <label>
                <span className="day-label">
                  {formatDayOff(date)}
                  {deducted.has(date) && <span className="note"> Deducted</span>}
                </span>
                <select value={draft.dayTypes[date]} onChange={(e) => setType(date, e.target.value as DayType)}>
                  {DAY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {DAY_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="primary" onClick={() => onSave(draft)}>
          Save
        </button>
      </div>
    </div>
  );
}

function DetailsEditor({
  editing,
  onChange,
  onSave,
  onDelete,
  onCancel,
}: {
  editing: Extract<Editing, { kind: "details" }>;
  onChange: (e: Editing) => void;
  onSave: (draft: Occasion) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const { draft } = editing;
  const set = (patch: Partial<Occasion>) => onChange({ ...editing, draft: { ...draft, ...patch } });

  return (
    <form
      className="details-editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (!draft.name.trim() || !draft.start) return;
        if (!datesSupported(draft.start, draft.end)) {
          onChange({ ...editing, messages: [DATE_RANGE_MESSAGE] });
          return;
        }
        const end = draft.end >= draft.start ? draft.end : draft.start;
        onSave(withRange({ ...draft, name: draft.name.trim() }, draft.start, end));
      }}
    >
      <Messages messages={editing.messages} />
      <label className="field">
        <span>Occasion</span>
        <input type="text" value={draft.name} onChange={(e) => set({ name: e.target.value })} required />
      </label>
      <div className="date-pair">
        <label className="field">
          <span>Start</span>
          <input
            type="date"
            value={draft.start}
            min={FIRST_DATE}
            max={LAST_DATE}
            onChange={(e) => set({ start: e.target.value })}
            required
          />
        </label>
        <label className="field">
          <span>End</span>
          <input
            type="date"
            value={draft.end}
            min={draft.start || FIRST_DATE}
            max={LAST_DATE}
            onChange={(e) => set({ end: e.target.value })}
          />
        </label>
      </div>
      <div className="actions">
        <button type="button" className="danger" onClick={onDelete}>
          Delete
        </button>
        <span className="spacer" />
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary">
          Save
        </button>
      </div>
    </form>
  );
}

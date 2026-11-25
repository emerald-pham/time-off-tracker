import { useId, useState } from "react";
import {
  FIRST_SUPPORTED_YEAR,
  LAST_SUPPORTED_YEAR,
  approvedDates,
  datesInRange,
  findRdoOverflows,
  isSupportedDate,
  rdoDates,
  weeklyDayTypes,
  withApprovedDays,
} from "../engine";
import type { DayType, IsoDate, Occasion, OccasionView, RdoOverflow } from "../engine";
import type { AppData } from "../storage";
import {
  DAY_TYPE_LABELS,
  formatDayOff,
  formatRange,
  seasonClass,
  seasonLabel,
  tooManyRdosMessage,
  typeClass,
} from "./format";
import { Reveal } from "./motion";
import {
  checkOccasion,
  endAfterStart,
  movedForward,
  withRange,
  withResolvedTypes,
  yearsToMove,
} from "./occasionEdits";
import "./occasions.css";

const DAY_TYPES: DayType[] = ["rdo", "floatingHoliday", "vacation", "unpaid"];

const SEASON_ICONS: Record<string, string> = { Winter: "❄️", Spring: "🌸", Summer: "☀️", Autumn: "🍂" };

interface Props {
  data: AppData;
  today: IsoDate;
  /** From the engine, sorted by start date. */
  occasions: OccasionView[];
  onChange: (occasions: Occasion[]) => void;
}

/** What's open: one Occasion's day editor, details form or delete question, or a new Occasion's day editor. */
type Editing =
  | {
      kind: "days";
      draft: Occasion;
      isNew: boolean;
      highlight: IsoDate[];
      messages: string[];
      /** US-23: the days whose approval was switched in the editor; Save leaves the rest as stored. */
      toggled?: IsoDate[];
    }
  | { kind: "details"; draft: Occasion; messages: string[] }
  | { kind: "delete"; draft: Occasion };

type Saved = { refused: { messages: string[]; highlight: IsoDate[] }; view?: undefined } | { refused?: undefined; view: OccasionView };

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function OccasionsPanel({ data, today, occasions, onChange }: Props) {
  const [editing, setEditing] = useState<Editing | null>(null);
  /** The new Occasion whose dates are already in the past: "Did you mean next year?" */
  const [yearCheck, setYearCheck] = useState<string | null>(null);
  const currentYear = Number(today.slice(0, 4));
  const stored = (id: string) => data.occasions.find((o) => o.id === id)!;
  const isPast = (o: OccasionView) => o.deducted || o.end < today;
  /** The RDO dates every other Occasion holds: a week's two days off are shared (US-25). */
  const heldByOthers = (id: string) => rdoDates(occasions.filter((o) => o.id !== id));

  /** Saves `candidate` unless it Clashes. */
  const trySave = (candidate: Occasion): Saved => {
    const check = checkOccasion(data, today, candidate);
    if (check.clashes.length > 0) {
      return { refused: { messages: check.messages, highlight: check.clashes.map((c) => c.date) } };
    }
    const saved = withResolvedTypes(candidate, check.view);
    onChange([...data.occasions.filter((o) => o.id !== saved.id), saved]);
    return { view: check.view };
  };

  /** Saves a new Occasion, then asks about next year if its dates are already past. */
  const saveNew = (draft: Occasion): Saved => {
    const result = trySave(draft);
    if (result.view) setYearCheck(isPast(result.view) ? draft.id : null);
    return result;
  };

  const add = (name: string, start: IsoDate, end: IsoDate) => {
    // Stored outright, so the old regular-days-off default for missing types never applies (US-18).
    const draft: Occasion = { id: newId(), name, start, end, dayTypes: weeklyDayTypes(start, end, rdoDates(occasions)) };
    const { refused } = saveNew(draft);
    if (refused) {
      // A new Occasion's defaults Clash: open its day editor with the clashing dates highlighted.
      const view = checkOccasion(data, today, draft).view;
      setEditing({ kind: "days", draft: withResolvedTypes(draft, view), isNew: true, ...refused });
    }
  };

  /** US-10: moves the dates to the first year they end on or after today, keeping the person's choices. */
  const moveToNextYear = (id: string) => {
    const o = stored(id);
    const moved = movedForward(o, yearsToMove(o, today), heldByOthers(id));
    setYearCheck(null);
    const { refused } = trySave(moved);
    if (refused) {
      const view = checkOccasion(data, today, moved).view;
      setEditing({ kind: "days", draft: withResolvedTypes(moved, view), isNew: false, ...refused });
    }
  };

  /** US-26: switches the Vacation days free Floating Holidays could cover, then saves through the Clash check. */
  const switchToFloatingHolidays = (o: OccasionView) => {
    const resolved = withResolvedTypes(stored(o.id), o);
    const switched: Occasion = {
      ...resolved,
      dayTypes: {
        ...resolved.dayTypes,
        ...Object.fromEntries(o.floatingHolidaysCouldCover.map((d) => [d, "floatingHoliday" as const])),
      },
    };
    const { refused } = trySave(switched);
    if (refused) setEditing({ kind: "days", draft: switched, isNew: false, ...refused });
    else if (editing?.draft.id === o.id) setEditing(null);
  };

  /** US-23: "Approve all" or "Unapprove all". */
  const setAllApproved = (id: string, approved: boolean) =>
    onChange(
      data.occasions.map((o) => (o.id === id ? withApprovedDays(o, approved ? datesInRange(o.start, o.end) : []) : o)),
    );

  const remove = (id: string) => {
    onChange(data.occasions.filter((o) => o.id !== id));
    setEditing(null);
    if (yearCheck === id) setYearCheck(null);
  };

  const newDraft = editing?.kind === "days" && editing.isNew ? editing : null;

  return (
    <div className="occasions">
      <AddOccasionForm onAdd={add} disabled={newDraft !== null} />

      <Reveal open={newDraft !== null}>
        {newDraft && (
          <div className="new-draft">
            <p className="draft-title">
              New: <strong>{newDraft.draft.name}</strong> ·{" "}
              {formatRange(newDraft.draft.start, newDraft.draft.end, currentYear)}
            </p>
            <DayEditor
              editing={newDraft}
              others={occasions.filter((x) => x.id !== newDraft.draft.id)}
              currentYear={currentYear}
              deducted={new Set()}
              onChange={setEditing}
              onSave={(draft) => {
                const { refused } = saveNew(draft);
                setEditing(refused ? { ...newDraft, draft, ...refused } : null);
              }}
              onCancel={() => setEditing(null)}
            />
          </div>
        )}
      </Reveal>

      {occasions.length === 0 && !newDraft ? (
        <p className="empty">No Occasions yet. Add one above to see what it uses.</p>
      ) : (
        <ul className="occasion-list">
          {occasions.map((o, i) => {
            const open = editing && !(editing.kind === "days" && editing.isNew) && editing.draft.id === o.id ? editing : null;
            const toggle = (next: Editing) => setEditing(open?.kind === next.kind ? null : next);
            return (
              <OccasionCard
                key={o.id}
                occasion={o}
                index={i}
                currentYear={currentYear}
                past={isPast(o)}
                open={open}
                yearCheck={yearCheck === o.id ? Number(o.start.slice(0, 4)) + yearsToMove(o, today) : null}
                onEdit={() => toggle({ kind: "details", draft: stored(o.id), messages: [] })}
                onChooseDays={() =>
                  toggle({
                    kind: "days",
                    draft: withResolvedTypes(stored(o.id), o),
                    isNew: false,
                    highlight: [],
                    messages: [],
                  })
                }
                onApproveAll={() => setAllApproved(o.id, true)}
                onUnapproveAll={() => setAllApproved(o.id, false)}
                onUseFloatingHolidays={() => switchToFloatingHolidays(o)}
                onDelete={() => toggle({ kind: "delete", draft: stored(o.id) })}
                onMoveToNextYear={() => moveToNextYear(o.id)}
                onKeepDates={() => setYearCheck(null)}
                editor={
                  open?.kind === "days" ? (
                    <DayEditor
                      editing={open}
                      others={occasions.filter((x) => x.id !== o.id)}
                      currentYear={currentYear}
                      deducted={new Set(o.days.filter((d) => d.deducted).map((d) => d.date))}
                      approvable={!isPast(o)}
                      onChange={setEditing}
                      onSave={(draft) => {
                        // US-23: approval changed meanwhile ("Approve all", another device) stands
                        // for every day not switched here.
                        const switched = new Set(open.toggled);
                        const inDraft = new Set(approvedDates(draft));
                        const current = new Set(approvedDates(stored(o.id)));
                        const approved = datesInRange(draft.start, draft.end).filter((d) =>
                          switched.has(d) ? inDraft.has(d) : current.has(d),
                        );
                        const { refused } = trySave(withApprovedDays(draft, approved));
                        setEditing(refused ? { ...open, draft, ...refused } : null);
                      }}
                      onCancel={() => setEditing(null)}
                    />
                  ) : open?.kind === "details" ? (
                    <DetailsEditor
                      editing={open}
                      onChange={setEditing}
                      onSave={(draft) => {
                        // The new range is worked out from the Occasion as saved, so its old
                        // range decides what's kept (Day Types, US-25; approval, US-23).
                        const { name, start, end } = draft;
                        const { refused } = trySave(withRange({ ...stored(o.id), name }, start, end, heldByOthers(o.id)));
                        setEditing(refused ? { ...open, draft, messages: refused.messages } : null);
                      }}
                      onCancel={() => setEditing(null)}
                    />
                  ) : open?.kind === "delete" ? (
                    <ConfirmDelete name={o.name} onDelete={() => remove(o.id)} onKeep={() => setEditing(null)} />
                  ) : null
                }
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

function OccasionCard({
  occasion: o,
  index,
  currentYear,
  past,
  open,
  yearCheck,
  onEdit,
  onChooseDays,
  onApproveAll,
  onUnapproveAll,
  onUseFloatingHolidays,
  onDelete,
  onMoveToNextYear,
  onKeepDates,
  editor,
}: {
  occasion: OccasionView;
  index: number;
  currentYear: number;
  past: boolean;
  open: Editing | null;
  /** The year to offer moving the dates to, or null when not asking. */
  yearCheck: number | null;
  onEdit: () => void;
  onChooseDays: () => void;
  onApproveAll: () => void;
  onUnapproveAll: () => void;
  onUseFloatingHolidays: () => void;
  onDelete: () => void;
  onMoveToNextYear: () => void;
  onKeepDates: () => void;
  editor: React.ReactNode;
}) {
  const count = (type: DayType) => o.days.filter((d) => d.dayType === type).length;
  const approvedCount = o.days.filter((d) => d.approved).length;
  const nameId = `occasion-${o.id}`;
  const classes = ["occasion-card", seasonClass(o.season), o.deducted && "deducted", o.approved && "approved"];

  return (
    <li
      className={classes.filter(Boolean).join(" ")}
      aria-labelledby={nameId}
      style={{ "--i": Math.min(index, 12) } as React.CSSProperties}
    >
      <div className="occasion-head">
        <h3 className="occasion-name" id={nameId}>
          {o.name}
        </h3>
        {/* US-23: a past Occasion is already taken, so approval no longer matters. */}
        {!past && (
          <span className={o.approved ? "badge approved" : "badge pending"}>
            {approvalSummary(approvedCount, o.days.length)}
          </span>
        )}
      </div>

      <RdoWarnings overflows={o.tooManyRdos} currentYear={currentYear} role="note" />

      {yearCheck !== null && (
        <div className="year-check" role="alert">
          <p>
            These dates are in the past. Did you mean {yearCheck}?
          </p>
          <div className="year-check-actions">
            <button type="button" className="primary" onClick={onMoveToNextYear}>
              Move to {yearCheck}
            </button>
            <button type="button" onClick={onKeepDates}>
              Keep these dates
            </button>
          </div>
        </div>
      )}

      <dl className="occasion-facts">
        <div className="fact">
          <dt>Dates</dt>
          <dd className="dates">{formatRange(o.start, o.end, currentYear)}</dd>
        </div>
        <div className="fact">
          <dt>PTO Days</dt>
          <dd className="pto">
            <span className="chips">
              {(["vacation", "floatingHoliday", "rdo"] as const).map(
                (t) =>
                  count(t) > 0 && (
                    <span key={t} className={`chip ${typeClass(t)}`}>
                      {count(t)} {t === "floatingHoliday" && count(t) > 1 ? "Floating Holidays" : DAY_TYPE_LABELS[t]}
                    </span>
                  ),
              )}
              {o.unpaid > 0 && <span className={`chip ${typeClass("unpaid")}`}>+{o.unpaid} unpaid</span>}
              {o.short > 0 && <span className="short">short by {o.short}</span>}
            </span>
          </dd>
        </div>
        <div className="fact">
          <dt>Season</dt>
          <dd>
            <span className={`season-chip ${seasonClass(o.season)}`}>
              <span aria-hidden="true">{SEASON_ICONS[o.season.name]} </span>
              {seasonLabel(o.season)}
            </span>
          </dd>
        </div>
      </dl>

      <div className="day-strip" aria-hidden="true">
        {o.days.map((d) => (
          <span key={d.date} className={`${typeClass(d.dayType)}${d.deducted ? " deducted" : ""}`} />
        ))}
      </div>

      <FloatingHolidayNudge count={o.floatingHolidaysCouldCover.length} onUse={onUseFloatingHolidays} />

      {past && <p className="past-label">Already taken · counted in your SAP balance</p>}

      <div className="occasion-actions">
        <button
          type="button"
          className={open?.kind === "details" ? "act-edit on" : "act-edit"}
          aria-expanded={open?.kind === "details"}
          onClick={onEdit}
        >
          Edit
        </button>
        <button
          type="button"
          className={open?.kind === "days" ? "act-days on" : "act-days"}
          aria-expanded={open?.kind === "days"}
          onClick={onChooseDays}
        >
          Choose days
        </button>
        {/* US-23: while "Choose days" is open, its switches and Save decide approval. */}
        {!past && open?.kind !== "days" && approvedCount < o.days.length && (
          <button type="button" className="act-approve" onClick={onApproveAll}>
            Approve all
          </button>
        )}
        {!past && open?.kind !== "days" && approvedCount > 0 && (
          <button type="button" className="act-unapprove" onClick={onUnapproveAll}>
            Unapprove all
          </button>
        )}
        <button
          type="button"
          className={open?.kind === "delete" ? "act-delete danger on" : "act-delete danger"}
          aria-expanded={open?.kind === "delete"}
          onClick={onDelete}
        >
          Delete
        </button>
      </div>

      <Reveal open={editor !== null}>{editor}</Reveal>
    </li>
  );
}

/** US-23: "Approved", "Not approved yet" or "Partly approved · 3 of 5 days". */
function approvalSummary(approved: number, days: number): string {
  if (days > 0 && approved === days) return "Approved";
  if (approved === 0) return "Not approved yet";
  return `Partly approved · ${approved} of ${days} days`;
}

/**
 * US-26: a gentle, non-blocking nudge to use free Floating Holidays before
 * Vacation, since they expire Dec 31 and Vacation carries over.
 */
function FloatingHolidayNudge({ count, onUse }: { count: number; onUse: () => void }) {
  if (count === 0) return null;
  const one = count === 1;
  return (
    <div className="fh-nudge" role="note">
      <p>
        <strong>
          {count} Floating Holiday{one ? "" : "s"}
        </strong>{" "}
        could cover {one ? "a day" : "days"} here instead of Vacation. {one ? "It expires" : "They expire"} Dec 31.
      </p>
      <button type="button" className="act-use-fh" onClick={onUse}>
        Use Floating Holidays
      </button>
    </div>
  );
}

function ConfirmDelete({ name, onDelete, onKeep }: { name: string; onDelete: () => void; onKeep: () => void }) {
  return (
    <div className="confirm-delete" role="group" aria-label={`Delete '${name}'?`}>
      <p>
        <strong>Delete '{name}'?</strong> This can't be undone.
      </p>
      <div className="actions">
        <button type="button" onClick={onKeep}>
          Keep it
        </button>
        <button type="button" className="danger solid" onClick={onDelete}>
          Yes, delete
        </button>
      </div>
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
  onAdd: (name: string, start: IsoDate, end: IsoDate) => void;
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
      <h3 className="add-title">Plan an Occasion</h3>
      <Messages messages={messages} />
      <label className="field name">
        <span>Occasion name</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Beach week" required />
      </label>
      <label className="field">
        <span>Start</span>
        <input
          type="date"
          value={start}
          min={FIRST_DATE}
          max={LAST_DATE}
          onChange={(e) => {
            setStart(e.target.value);
            setEnd(endAfterStart(e.target.value, end));
          }}
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
        Add Occasion
      </button>
    </form>
  );
}

/** US-29: a red warning per week with more than two RDOs. A warning only: nothing is refused. */
function RdoWarnings({
  overflows,
  currentYear,
  role,
}: {
  overflows: RdoOverflow[];
  currentYear: number;
  role: "note" | "alert";
}) {
  if (overflows.length === 0) return null;
  return (
    <div className="clash-messages rdo-warning" role={role}>
      {overflows.map((w) => (
        <p key={w.week}>{tooManyRdosMessage(w, currentYear)}</p>
      ))}
    </div>
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
  others,
  currentYear,
  deducted,
  approvable = true,
  onChange,
  onSave,
  onCancel,
}: {
  editing: Extract<Editing, { kind: "days" }>;
  /** Every other Occasion: they share each week's two days off. */
  others: OccasionView[];
  currentYear: number;
  deducted: Set<IsoDate>;
  /** False for an Occasion already taken: approval no longer matters (US-23). */
  approvable?: boolean;
  onChange: (e: Editing) => void;
  onSave: (draft: Occasion) => void;
  onCancel: () => void;
}) {
  const { draft } = editing;
  const idPrefix = useId();
  const dates = Object.keys(draft.dayTypes).sort();
  const setType = (date: IsoDate, type: DayType) =>
    onChange({ ...editing, draft: { ...draft, dayTypes: { ...draft.dayTypes, [date]: type } } });
  const held = rdoDates(others);
  /** US-29: weeks with more than two RDOs once the draft's choices count, kept live while editing. */
  const tooManyRdos = findRdoOverflows(
    [...others, { ...draft, days: dates.map((date) => ({ date, dayType: draft.dayTypes[date] })) }].sort(
      (a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id),
    ),
  ).filter((w) => w.occasions.some((o) => o.occasionId === draft.id));
  const extraRdos = new Set(tooManyRdos.flatMap((w) => w.dates).filter((d) => draft.dayTypes[d] === "rdo"));
  const approved = new Set(approvedDates(draft));
  /** US-23: switches one day between Approved and Not approved, in the draft. */
  const toggleApproved = (date: IsoDate) => {
    const next = new Set(approved);
    if (!next.delete(date)) next.add(date);
    const toggled = editing.toggled?.includes(date) ? editing.toggled : [...(editing.toggled ?? []), date];
    onChange({ ...editing, draft: withApprovedDays(draft, next), toggled });
  };
  /**
   * The weekly rule (US-25) over the draft, leaving Deducted days as they are
   * (SAP already shows them); Save commits it, Cancel discards it.
   */
  const fillIn = () => {
    const rule = weeklyDayTypes(draft.start, draft.end, held);
    const dayTypes = Object.fromEntries(dates.map((d) => [d, deducted.has(d) ? draft.dayTypes[d] : rule[d]]));
    onChange({ ...editing, draft: { ...draft, dayTypes } });
  };

  return (
    <div className="day-editor">
      <p className="editor-title">Choose each day's type</p>
      <Messages messages={editing.messages} />
      <RdoWarnings overflows={tooManyRdos} currentYear={currentYear} role="alert" />
      <button type="button" className="fill-auto" onClick={fillIn}>
        Fill in automatically
      </button>
      <ul className="day-list">
        {dates.map((date) => {
          const classes = [
            "day",
            deducted.has(date) && "deducted",
            editing.highlight.includes(date) && "clashing",
            extraRdos.has(date) && "too-many-rdos",
          ].filter(Boolean);
          const type = draft.dayTypes[date];
          const labelId = `${idPrefix}-${date}`;
          const isApproved = approved.has(date);
          return (
            <li key={date} className={classes.join(" ")}>
              <label>
                <span className="day-label" id={labelId}>
                  {formatDayOff(date)}
                  {deducted.has(date) && <span className="note"> Deducted</span>}
                </span>
                <select
                  className={`type-select ${typeClass(type)}`}
                  aria-labelledby={labelId}
                  value={type}
                  onChange={(e) => setType(date, e.target.value as DayType)}
                >
                  {DAY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {DAY_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                {/* US-23: a Deducted day is history, so its approval no longer matters. */}
                {approvable && !deducted.has(date) && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isApproved}
                    aria-describedby={labelId}
                    className={`day-approval ${isApproved ? "act-approve" : "act-unapprove"}`}
                    onClick={() => toggleApproved(date)}
                  >
                    {isApproved ? "Approved" : "Not approved"}
                  </button>
                )}
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
  onCancel,
}: {
  editing: Extract<Editing, { kind: "details" }>;
  onChange: (e: Editing) => void;
  /** The draft with its name trimmed and a range that ends on or after its start. */
  onSave: (draft: Occasion) => void;
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
        onSave({ ...draft, name: draft.name.trim(), end });
      }}
    >
      <p className="editor-title">Edit the name and dates</p>
      <Messages messages={editing.messages} />
      <label className="field">
        <span>Occasion name</span>
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
            onChange={(e) => set({ start: e.target.value, end: endAfterStart(e.target.value, draft.end) })}
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

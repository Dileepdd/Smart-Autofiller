import { DataMode, FieldType, FillStats } from "./types";

const KEY = "smartAutofillStats";
/** Enough for the dashboard's 30-day chart with room to spare, while storage stays a few kilobytes. */
const KEEP_DAYS = 90;

/**
 * Typical seconds a person spends typing or choosing each kind of field. Time saved is an
 * estimate built from these, and the dashboard says so.
 */
export const SECONDS_PER_FIELD: Readonly<Record<FieldType, number>> = {
  text: 5, longText: 12, email: 6, phone: 5, number: 3, date: 6, dropdown: 3, choice: 1.5
};

export const FIELD_TYPE_LABELS: Readonly<Record<FieldType, string>> = {
  text: "Text", longText: "Long text", email: "Email", phone: "Phone", number: "Number", date: "Date and time", dropdown: "Dropdown", choice: "Checkbox and radio"
};

export interface UsageStats {
  since: string;
  fills: number;
  fields: number;
  secondsSaved: number;
  /** Time the fills themselves took, for the average speed. */
  fillMs: number;
  byType: Partial<Record<FieldType, number>>;
  byMode: Partial<Record<DataMode, number>>;
  problems: number;
  copies: number;
  scripts: number;
  undos: number;
  clears: number;
  /** Forms filled and fields filled per day, keyed by local date. */
  days: Record<string, [number, number]>;
}

export type UsageAction = "copies" | "undos" | "clears" | "scripts";

const empty = (): UsageStats => ({
  since: new Date().toISOString(), fills: 0, fields: 0, secondsSaved: 0, fillMs: 0,
  byType: {}, byMode: {}, problems: 0, copies: 0, scripts: 0, undos: 0, clears: 0, days: {}
});

const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);

/** A local date such as 2026-11-18, so a day ends at midnight where the person is. */
export const dayKey = (date = new Date()): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Whatever is stored, as complete stats. Damaged values count as zero rather than breaking the dashboard. */
export function migrateStats(stored: unknown): UsageStats {
  const base = empty();
  if (typeof stored !== "object" || stored === null) return base;
  const value = stored as Partial<UsageStats>;
  const counts = (record: unknown): Record<string, number> =>
    typeof record === "object" && record !== null ? Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, count(entry)])) : {};
  const days = typeof value.days === "object" && value.days !== null
    ? Object.fromEntries(Object.entries(value.days).flatMap(([day, entry]) =>
      Array.isArray(entry) ? [[day, [count(entry[0]), count(entry[1])] as [number, number]]] : []))
    : {};
  return {
    since: typeof value.since === "string" ? value.since : base.since,
    fills: count(value.fills), fields: count(value.fields), secondsSaved: count(value.secondsSaved), fillMs: count(value.fillMs),
    byType: counts(value.byType), byMode: counts(value.byMode),
    problems: count(value.problems), copies: count(value.copies), scripts: count(value.scripts), undos: count(value.undos), clears: count(value.clears),
    days
  };
}

const pruneDays = (days: UsageStats["days"], today: string): UsageStats["days"] => {
  const oldest = new Date(`${today}T00:00:00`);
  oldest.setDate(oldest.getDate() - KEEP_DAYS);
  const cutoff = dayKey(oldest);
  return Object.fromEntries(Object.entries(days).filter(([day]) => day > cutoff));
};

export const secondsFor = (byType: Partial<Record<FieldType, number>>): number =>
  Object.entries(byType).reduce((total, [type, fields]) => total + (fields ?? 0) * SECONDS_PER_FIELD[type as FieldType], 0);

/** Adds one fill, or one field filled from the menu, to the stats. Pure, so it is easy to test. */
export function addFill(stats: UsageStats, fill: FillStats, mode: DataMode, problems: number, wholeForm: boolean, now = new Date()): UsageStats {
  const fields = Object.values(fill.byType).reduce((total, value) => total + (value ?? 0), 0);
  const byType = { ...stats.byType };
  for (const [type, value] of Object.entries(fill.byType)) byType[type as FieldType] = (byType[type as FieldType] ?? 0) + (value ?? 0);
  const today = dayKey(now);
  const [dayFills, dayFields] = stats.days[today] ?? [0, 0];
  return {
    ...stats,
    fills: stats.fills + (wholeForm ? 1 : 0),
    fields: stats.fields + fields,
    secondsSaved: stats.secondsSaved + secondsFor(fill.byType),
    fillMs: stats.fillMs + (wholeForm ? fill.ms : 0),
    byType,
    byMode: wholeForm ? { ...stats.byMode, [mode]: (stats.byMode[mode] ?? 0) + 1 } : stats.byMode,
    problems: stats.problems + problems,
    days: pruneDays({ ...stats.days, [today]: [dayFills + (wholeForm ? 1 : 0), dayFields + fields] }, today)
  };
}

export async function getStats(): Promise<UsageStats> {
  return migrateStats((await chrome.storage.local.get(KEY))[KEY]);
}

/** One write at a time, so two quick actions cannot overwrite each other's counts. */
let queue: Promise<unknown> = Promise.resolve();

function update(change: (stats: UsageStats) => UsageStats): Promise<void> {
  const next = queue.catch(() => undefined).then(async () => {
    await chrome.storage.local.set({ [KEY]: change(await getStats()) });
  });
  queue = next;
  return next;
}

/** A single local write after a fill: no network, and nothing that slows the fill down. */
export const recordFill = (fill: FillStats, mode: DataMode, problems: number, wholeForm = true): Promise<void> =>
  update((stats) => addFill(stats, fill, mode, problems, wholeForm));

export const recordAction = (action: UsageAction): Promise<void> =>
  update((stats) => ({ ...stats, [action]: stats[action] + 1 }));

export const resetStats = (): Promise<void> => chrome.storage.local.set({ [KEY]: empty() });

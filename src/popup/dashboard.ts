import { dayKey, FIELD_TYPE_LABELS, getStats, resetStats, SECONDS_PER_FIELD, UsageStats } from "../shared/stats";
import { DATA_MODES, DataMode, FieldType } from "../shared/types";

const CHART_DAYS = 30;
const CONFIRM_MS = 4000;

const number = (value: number): string => Math.round(value).toLocaleString();

/** "3 h 20 min", "12 min" or "40 s": precise enough for an estimate. */
export function duration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
}

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function card(label: string, value: string, note: string): HTMLElement {
  const box = element("div", "stat-card");
  box.append(element("p", "stat-label", label), element("p", "stat-value", value), element("p", "stat-note", note));
  return box;
}

function lastDays(stats: UsageStats): Array<{ day: string; fills: number; fields: number }> {
  return Array.from({ length: CHART_DAYS }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (CHART_DAYS - 1 - index));
    const day = dayKey(date);
    const [fills, fields] = stats.days[day] ?? [0, 0];
    return { day, fills, fields };
  });
}

/** Forms filled per day as bars. Each bar carries its numbers for screen readers and on hover. */
function chart(stats: UsageStats): HTMLElement {
  const days = lastDays(stats);
  const highest = Math.max(1, ...days.map(({ fills }) => fills));
  const panel = element("section", "panel");
  panel.append(element("h3", "", "Forms filled, last 30 days"));
  const bars = element("div", "chart");
  bars.setAttribute("role", "list");
  for (const { day, fills, fields } of days) {
    const bar = element("div", "chart-bar");
    bar.setAttribute("role", "listitem");
    const label = `${new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}: ${fills} forms, ${fields} fields`;
    bar.title = label;
    bar.setAttribute("aria-label", label);
    const fill = element("span");
    fill.style.height = `${(fills / highest) * 100}%`;
    bar.append(fill);
    bars.append(bar);
  }
  panel.append(bars);
  return panel;
}

function breakdown(title: string, rows: Array<[string, number]>, empty: string): HTMLElement {
  const panel = element("section", "panel");
  panel.append(element("h3", "", title));
  const shown = rows.filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
  if (!shown.length) {
    panel.append(element("p", "hint", empty));
    return panel;
  }
  const highest = Math.max(...shown.map(([, value]) => value));
  const list = element("ul", "bars");
  for (const [label, value] of shown) {
    const row = element("li");
    const meter = element("span", "meter");
    const fill = element("span");
    fill.style.width = `${(value / highest) * 100}%`;
    meter.append(fill);
    row.append(element("span", "bar-label", label), meter, element("span", "bar-value", number(value)));
    list.append(row);
  }
  panel.append(list);
  return panel;
}

export function renderDashboard(root: HTMLElement, stats: UsageStats): void {
  const today = stats.days[dayKey()] ?? [0, 0];
  const week = lastDays(stats).slice(-7).reduce((total, { fills }) => total + fills, 0);
  const average = stats.fills ? stats.fillMs / stats.fills / 1000 : 0;

  const cards = element("div", "stat-grid");
  cards.append(
    card("Forms filled", number(stats.fills), `${number(today[0])} today, ${number(week)} this week`),
    card("Fields filled", number(stats.fields), `${number(today[1])} today`),
    card("Time saved", `≈ ${duration(stats.secondsSaved)}`, "Estimated from typical typing time"),
    card("Average fill", stats.fills ? `${average.toFixed(1)} s` : "–", "Per form")
  );

  const types = (Object.keys(FIELD_TYPE_LABELS) as FieldType[]).map((type): [string, number] => [FIELD_TYPE_LABELS[type], stats.byType[type] ?? 0]);
  const modes = (Object.keys(DATA_MODES) as DataMode[]).map((mode): [string, number] => [DATA_MODES[mode].label, stats.byMode[mode] ?? 0]);
  const activity: Array<[string, number]> = [["Problems found", stats.problems], ["Bug reports copied", stats.copies], ["Test scripts made", stats.scripts], ["Undos", stats.undos], ["Forms cleared", stats.clears]];

  const panels = element("div", "panel-grid");
  panels.append(
    breakdown("Fields by type", types, "Fill a form to see which kinds of fields you test most."),
    breakdown("Test data used", modes, "No fills yet."),
    breakdown("Activity", activity, "Nothing yet.")
  );

  const assumptions = Object.entries(SECONDS_PER_FIELD).map(([type, seconds]) => `${FIELD_TYPE_LABELS[type as FieldType].toLowerCase()} ${seconds} s`).join(", ");
  const foot = element("p", "hint");
  foot.textContent = `Counted since ${new Date(stats.since).toLocaleDateString()} and stored only in this browser. Time saved assumes ${assumptions} per field.`;

  const reset = element("button", "secondary", "Reset statistics");
  reset.type = "button";
  reset.id = "resetStats";
  let confirmTimer: number | undefined;
  reset.addEventListener("click", async () => {
    if (!reset.dataset.confirm) {
      reset.dataset.confirm = "true";
      reset.textContent = "Click again to reset";
      confirmTimer = window.setTimeout(() => { delete reset.dataset.confirm; reset.textContent = "Reset statistics"; }, CONFIRM_MS);
      return;
    }
    window.clearTimeout(confirmTimer);
    await resetStats();
    await showDashboard(root);
  });

  root.replaceChildren(element("h2", "section-title", "Dashboard"), cards, chart(stats), panels, foot, reset);
}

export async function showDashboard(root: HTMLElement): Promise<void> {
  renderDashboard(root, await getStats());
}

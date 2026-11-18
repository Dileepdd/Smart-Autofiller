import { DATA_MODES, DataMode, FieldType, ReportFormat } from "../shared/types";
import { fieldLabel } from "./context";
import { comboboxValue } from "./customDropdown";
import { isChoice, isCombobox, isEditable, isSelect } from "./detector";

export interface FilledField {
  field: string;
  value: string;
}

export interface FillReport {
  page: string;
  filledAt: string;
  dataMode: string;
  fields: FilledField[];
  issues: string[];
}

const MASK = "••••••••";

let lastReport: FillReport | undefined;

/** The value as it ended up on the page, which is what a bug report needs. Passwords are never written out. */
function finalValue(element: HTMLElement): string {
  if (isSelect(element)) {
    const chosen = element.multiple ? Array.from(element.options).filter((option) => option.selected) : [element.options[element.selectedIndex]];
    return chosen.filter(Boolean).map((option) => option.text.trim()).join(", ");
  }
  if (isChoice(element)) return element.checked ? (element.type === "radio" ? "Selected" : "Checked") : "Unchecked";
  if (isCombobox(element)) return comboboxValue(element);
  if (isEditable(element)) return (element.textContent ?? "").trim();
  const input = element as HTMLInputElement;
  return input.type === "password" ? MASK : input.value;
}

/** Remembers what the last fill wrote on this page, until the page reloads. */
export function rememberFill(elements: HTMLElement[], dataMode: DataMode, issues: string[]): void {
  lastReport = {
    page: location.href,
    filledAt: new Date().toISOString(),
    dataMode: DATA_MODES[dataMode].label,
    fields: elements.filter((element) => element.isConnected).map((element) => ({ field: fieldLabel(element), value: finalValue(element) })),
    issues
  };
}

export const lastFill = (): FillReport | undefined => lastReport;

/** Read from the element alone, which costs nothing, rather than classifying every field again. */
export function fieldType(element: HTMLElement): FieldType {
  if (isSelect(element) || isCombobox(element)) return "dropdown";
  if (isChoice(element)) return "choice";
  if (element.tagName === "TEXTAREA" || isEditable(element)) return "longText";
  const type = (element.getAttribute("type") ?? "text").toLowerCase();
  if (type === "email") return "email";
  if (type === "tel") return "phone";
  if (type === "number") return "number";
  if (["date", "datetime-local", "time", "month", "week"].includes(type)) return "date";
  return "text";
}

export function countTypes(elements: HTMLElement[]): Partial<Record<FieldType, number>> {
  const counts: Partial<Record<FieldType, number>> = {};
  for (const element of elements) counts[fieldType(element)] = (counts[fieldType(element)] ?? 0) + 1;
  return counts;
}

const readableTime = (iso: string): string => new Date(iso).toLocaleString();

/** Keeps a value from breaking a Markdown table: pipes are escaped and line breaks flattened. */
const cell = (text: string): string => text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");

export function formatReport(report: FillReport, format: ReportFormat): string {
  if (format === "json") return JSON.stringify(report, null, 2);
  const title = `Smart Autofill test data (${report.dataMode}), ${readableTime(report.filledAt)}`;
  if (format === "markdown") {
    const rows = report.fields.map(({ field, value }) => `| ${cell(field)} | ${cell(value)} |`);
    const issues = report.issues.length ? ["", "**Issues**", ...report.issues.map((issue) => `- ${issue}`)] : [];
    return [`**${title}**`, `Page: ${report.page}`, "", "| Field | Value |", "|---|---|", ...rows, ...issues].join("\n");
  }
  const issues = report.issues.length ? ["", "Issues:", ...report.issues.map((issue) => `- ${issue}`)] : [];
  return [title, `Page: ${report.page}`, "", ...report.fields.map(({ field, value }) => `${field}: ${value}`), ...issues].join("\n");
}

/** Problems worth putting in a bug report: rejected and invalid fields, not routine skips. */
export const reportIssues = (details: string[]): string[] =>
  details.filter((line) => /^(Invalid|Could not|Field rejected|Field cleared|Unsupported|Ran out|Blocked)/.test(line));

/** Writes to the clipboard from the page, which has focus after a right-click on it. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.documentElement.append(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  }
}

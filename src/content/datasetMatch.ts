import type { DatasetRow } from "../shared/dataset";
import { DatasetBlank, DateFormat } from "../shared/types";
import { classifyField, classifyText, FieldKind } from "./classifier";
import { fieldLabel, fieldSignals, splitWords } from "./context";
import { pageLanguage } from "./languages";

/** Kinds too broad to pair a column with a field by kind alone. */
const BROAD_KINDS: ReadonlySet<FieldKind> = new Set(["text", "message", "number", "date", "skip"]);

interface Column {
  header: string;
  words: string;
  kind?: FieldKind;
  value: string;
}

export type RowValue = { value: string } | { skip: true } | undefined;

export interface RowMatcher {
  /** The row's value for a field, an instruction to leave it alone, or nothing when no column fits. */
  valueFor(element: HTMLElement): RowValue;
  /** Values for the profile, so generated fields agree with the sheet: a ZIP code with its city, an email with its name. */
  profileValues(): Partial<Record<FieldKind, string>>;
}

/**
 * Pairs each field with a column. In order: a header equal to the field's label, name or placeholder;
 * then a header naming the same kind of field, such as "E-mail" for an email field; then a header
 * contained in the field's description, longer headers first so "Company Name" wins over "Name".
 */
export function createRowMatcher(row: DatasetRow, blank: DatasetBlank, document: Document): RowMatcher {
  const language = pageLanguage(document);
  const columns: Column[] = row.headers.map((header, index) => ({
    header,
    words: splitWords(header),
    kind: classifyText(header, language),
    value: row.values[index] ?? ""
  })).filter(({ words }) => words !== "");
  const byLength = [...columns].sort((a, b) => b.words.length - a.words.length);

  const resolve = (column: Column | undefined): RowValue => {
    if (!column) return undefined;
    if (column.value !== "") return { value: column.value };
    return blank === "empty" ? { skip: true } : undefined;
  };

  return {
    valueFor(element) {
      // A radio button's own label is one of the answers, such as "Email", so only its group's question can name it.
      const radio = groupNames(element);
      const texts = radio.length ? radio : [fieldLabel(element), ...fieldSignals(element).map(({ text }) => text)];
      const names = new Set(texts.map(splitWords).filter(Boolean));
      const exact = columns.find(({ words }) => names.has(words));
      if (exact) return resolve(exact);
      const kind = classifyField(element);
      if (!radio.length && !BROAD_KINDS.has(kind)) {
        const sameKind = columns.find((column) => column.kind === kind);
        if (sameKind) return resolve(sameKind);
      }
      const description = ` ${[...names].join(" ")} `;
      return resolve(byLength.find(({ words }) => description.includes(` ${words} `)));
    },
    profileValues() {
      const values: Partial<Record<FieldKind, string>> = {};
      for (const { kind, value } of columns) if (kind && value && !(kind in values)) values[kind] = value;
      return values;
    }
  };
}

/** A radio button's own label names one option, so its group's question comes from the fieldset legend or the group's name. */
function groupNames(element: HTMLElement): string[] {
  if (element.tagName !== "INPUT" || (element as HTMLInputElement).type !== "radio") return [];
  const legend = element.closest("fieldset")?.querySelector("legend")?.textContent ?? "";
  return [legend, element.getAttribute("name") ?? ""];
}

/** Words a sheet uses for a ticked box. Anything else, including an empty cell, means unticked. */
export const isTruthy = (value: string): boolean => /^(true|yes|y|1|x|checked|on|ja|oui|si|sí|sim|ok|✓|✔)$/i.test(value.trim());

/** A date typed as 25/12/2026 or 12/25/2026 becomes 2026-12-25 for a date field, read in the chosen date format. */
export function isoDate(value: string, format: DateFormat): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value.trim());
  if (!parts) return value;
  const [day, month] = format === "MM/DD/YYYY" ? [parts[2], parts[1]] : [parts[1], parts[2]];
  return `${parts[3]}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

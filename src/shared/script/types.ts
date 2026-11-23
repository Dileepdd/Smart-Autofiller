/**
 * Everything known about how to find a field again, each part only when it is unique on the page.
 * Each framework picks the part that reads best and breaks least in its own idiom.
 */
export interface FieldLocator {
  label?: { text: string; source: "for" | "wrap" | "aria"; id?: string };
  testAttr?: { attr: string; value: string };
  name?: string;
  id?: string;
  /** Always present. A last resort, marked in scripts as likely to break. */
  css: string;
}

export type ActionKind = "fill" | "select" | "check" | "uncheck" | "radio" | "customSelect";

/** One step of a fill: what was done to which field, with which value. */
export interface ScriptAction {
  kind: ActionKind;
  label: string;
  locator: FieldLocator;
  value: string;
  /** The dataset column that supplied the value, for a test that loops over every row. */
  column?: string;
  /** A password: its value is never written into a script. */
  secret?: boolean;
}

export interface ScriptOptions {
  url: string;
  /** Set for a data-driven test: the CSV file that sits beside it. */
  csvName?: string;
}

export interface ScriptGenerator {
  name: string;
  extension: string;
  steps(actions: ScriptAction[]): string;
  file(actions: ScriptAction[], options: ScriptOptions): string;
}

import { FieldLocator, ScriptAction } from "../../shared/script/types";
import { choiceLabel, fieldLabel } from "../context";
import { comboboxValue } from "../customDropdown";
import { isChoice, isCombobox, isEditable, isSelect } from "../detector";
import { createLocator } from "./selector";

/** The fields the last fill wrote. Steps are worked out only when a script is asked for, so fills stay fast. */
let lastElements: HTMLElement[] = [];
let lastColumns = new Map<HTMLElement, string>();
let lastUrl = "";

/** What a fill did to one field, as a script step. Passwords keep no value. */
function actionFor(element: HTMLElement, locator: FieldLocator, column?: string): ScriptAction | undefined {
  const label = fieldLabel(element);
  const base = { label, locator, ...(column ? { column } : {}) };
  if (isChoice(element)) {
    if (element.type === "radio") return { ...base, kind: "radio", value: choiceLabel(element) || element.value };
    return { ...base, kind: element.checked ? "check" : "uncheck", value: element.checked ? "true" : "false" };
  }
  if (isSelect(element)) {
    const option = element.options[element.selectedIndex];
    return option ? { ...base, kind: "select", value: option.text.trim() } : undefined;
  }
  if (isCombobox(element)) {
    const value = comboboxValue(element);
    return value ? { ...base, kind: "customSelect", value } : undefined;
  }
  if (isEditable(element)) return { ...base, kind: "fill", value: (element.textContent ?? "").trim() };
  const input = element as HTMLInputElement;
  if (input.type === "password") return { ...base, kind: "fill", value: "", secret: true };
  return { ...base, kind: "fill", value: input.value };
}

/** Remembers which fields the last fill wrote on this page, until the page reloads. */
export function rememberActions(elements: HTMLElement[], columns: Map<HTMLElement, string>): void {
  lastElements = [...elements];
  lastColumns = new Map(columns);
  lastUrl = location.href;
}

/** The last fill's steps, with each field's current value and the selectors that find it now. */
export function lastScript(): { actions: ScriptAction[]; url: string } {
  const elements = lastElements.filter((element) => element.isConnected);
  if (!elements.length) return { actions: [], url: lastUrl };
  const locate = createLocator(elements[0].ownerDocument);
  const actions = elements.flatMap((element) => actionFor(element, locate(element), lastColumns.get(element)) ?? []);
  return { actions, url: lastUrl };
}

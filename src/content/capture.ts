import { choiceLabel, fieldLabel } from "./context";
import { comboboxValue } from "./customDropdown";
import { collectFields, isChoice, isCombobox, isEditable, isSelect, isVisible } from "./detector";
import { hasSelection } from "./dropdown";

export interface CapturedField {
  field: string;
  value: string;
}

/** The question a group of radio buttons answers: its fieldset's legend, or failing that the group's name. */
function groupName(radio: HTMLInputElement): string {
  const legend = radio.closest("fieldset")?.querySelector("legend")?.textContent?.trim();
  return legend || radio.name || fieldLabel(radio);
}

/**
 * The form as it stands, one entry per field with a value, for saving as a dataset row. Passwords are
 * never captured, and neither are hidden or empty fields.
 */
export function captureForm(document: Document): CapturedField[] {
  const captured = new Map<string, string>();
  for (const element of collectFields(document, { includeFrames: false, scope: "all" })) {
    if (!isVisible(element)) continue;
    if (element.tagName === "INPUT" && (element as HTMLInputElement).type === "password") continue;
    let field = fieldLabel(element);
    let value: string;
    if (isChoice(element)) {
      if (element.type === "radio") {
        if (!element.checked) continue;
        field = groupName(element);
        value = choiceLabel(element) || element.value;
      } else {
        value = element.checked ? "TRUE" : "FALSE";
      }
    } else if (isSelect(element)) {
      value = hasSelection(element) ? Array.from(element.options).filter((option) => option.selected).map((option) => option.text.trim()).join(", ") : "";
    } else if (isCombobox(element)) {
      value = comboboxValue(element);
    } else if (isEditable(element)) {
      value = (element.textContent ?? "").trim();
    } else {
      value = (element as HTMLInputElement).value.trim();
    }
    if (value && !captured.has(field)) captured.set(field, value);
  }
  return [...captured].map(([field, value]) => ({ field, value }));
}

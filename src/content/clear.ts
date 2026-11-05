import { AutofillSettings, ClearResult } from "../shared/types";
import { classifyField } from "./classifier";
import { comboboxHasValue } from "./customDropdown";
import { collectFields, isCombobox, isDisabled, isEditable, isInput, isSelect, isVisible } from "./detector";
import { remember, startSnapshot } from "./undo";
import { blockSubmissions, toggle, writeEditable, writeMultiSelect, writeSelect, writeValue } from "./writers";

/** Empties one field. Returns undefined when it was already empty, and false when it has no safe way back. */
function clearField(element: HTMLElement): boolean | undefined {
  if (isCombobox(element)) return comboboxHasValue(element) ? false : undefined;
  if (isEditable(element)) {
    if (!element.textContent) return undefined;
    remember(element);
    writeEditable(element, "");
    return true;
  }
  if (isSelect(element)) {
    if (element.multiple) {
      if (!element.selectedOptions.length) return undefined;
      remember(element);
      writeMultiSelect(element, []);
      return true;
    }
    // A list with no blank option cannot go back to empty.
    if (element.value === "") return undefined;
    if (!Array.from(element.options).some((option) => option.value === "")) return false;
    remember(element);
    writeSelect(element, "");
    return true;
  }
  const field = element as HTMLInputElement | HTMLTextAreaElement;
  if (isInput(field) && field.type === "radio") return field.checked ? false : undefined;
  if (isInput(field) && field.type === "checkbox") {
    if (!field.checked) return undefined;
    remember(field);
    toggle(field);
    return true;
  }
  if (field.value === "") return undefined;
  remember(field);
  writeValue(field, "");
  return true;
}

/** Empties the same fields a fill would use, and can be reversed with Undo. Search boxes and the like stay as they are. */
export function clearPage(settings: AutofillSettings): ClearResult {
  const result: ClearResult = { cleared: 0, notCleared: 0 };
  startSnapshot();
  const allowSubmissions = blockSubmissions(() => undefined);
  try {
    for (const element of collectFields(document, { includeFrames: settings.includeFrames, scope: settings.fillScope })) {
      if (!isVisible(element) || isDisabled(element) || classifyField(element) === "skip") continue;
      const outcome = clearField(element);
      if (outcome === true) result.cleared++;
      if (outcome === false) result.notCleared++;
    }
  } finally {
    allowSubmissions();
  }
  return result;
}

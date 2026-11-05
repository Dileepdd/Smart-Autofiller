import { createProfile } from "../generators/profile";
import { generateValue } from "../generators/values";
import { AutofillSettings, FieldResult } from "../shared/types";
import { classifyField } from "./classifier";
import { isChoice, isDisabled, isEditable, isInput, isTextArea, isVisible } from "./detector";
import { remember, startSnapshot } from "./undo";
import { blockSubmissions, writeEditable, writeValue } from "./writers";

/**
 * Right-clicking a field focuses it, and Chrome does not say which element a menu was opened on.
 * Looks inside shadow roots and same-origin frames, because a shortcut does not say which frame it came from.
 */
function focusedElement(): HTMLElement | null {
  let active = document.activeElement;
  for (;;) {
    const inner: Element | null | undefined = active?.shadowRoot?.activeElement ?? (active as HTMLIFrameElement | null)?.contentDocument?.activeElement;
    if (!inner) return active as HTMLElement | null;
    active = inner;
  }
}

const failed = (message: string): FieldResult => ({ filled: false, message });

function write(element: HTMLElement, value: string): boolean {
  if (!isEditable(element)) return writeValue(element as HTMLInputElement | HTMLTextAreaElement, value);
  writeEditable(element, value);
  return true;
}

/** Fills the field the menu was opened on, with `value` or else a generated value for that field. */
export function fillFocusedField(settings: AutofillSettings, value?: string): FieldResult {
  const element = focusedElement();
  const isTextField = element !== null && (isTextArea(element) || (isInput(element) && !isChoice(element)) || isEditable(element));
  if (!isTextField) return failed("Click inside a text field first.");
  if (!isVisible(element) || isDisabled(element)) return failed("This field cannot be edited.");

  const kind = classifyField(element);
  // Asking for one exact value is a deliberate choice; generating one for a card or code field is not.
  if (value === undefined && kind === "skip") return failed("This kind of field is left alone. Pick a value from the menu instead.");
  const field = isEditable(element) ? undefined : element as HTMLInputElement | HTMLTextAreaElement;
  const text = value ?? generateValue(kind === "skip" ? "text" : kind, settings, createProfile(settings), field);

  startSnapshot();
  remember(element);
  const allowSubmissions = blockSubmissions(() => undefined);
  try {
    return write(element, text) ? { filled: true, message: "Filled this field." } : failed("The field rejected that value.");
  } finally {
    allowSubmissions();
  }
}

import { FillScope } from "../shared/types";

export type NativeField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const NATIVE_FIELDS =
  "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=file])" +
  ":not([type=image]):not([type=color]):not([type=range]), textarea, select";
const COMBOBOXES = "[role=combobox], [aria-haspopup=listbox]";
const EDITABLES = "[contenteditable=''], [contenteditable=true]";
/** Editable day, month and year sections of a sectioned date field, which is filled through its own input. */
const DATE_SECTIONS = "[role=spinbutton]";
/** MUI X keeps this input hidden from assistive technology, yet it is the field's real value. */
const SECTIONED_DATE_INPUT = "input.MuiPickersInputBase-input";

// Tag checks rather than instanceof: elements inside iframes belong to a different window.
export const isSelect = (element: Element): element is HTMLSelectElement => element.tagName === "SELECT";
export const isTextArea = (element: Element): element is HTMLTextAreaElement => element.tagName === "TEXTAREA";
export const isInput = (element: Element): element is HTMLInputElement => element.tagName === "INPUT";

export const isChoice = (element: Element): element is HTMLInputElement =>
  isInput(element) && (element.type === "checkbox" || element.type === "radio");
export const isCombobox = (element: Element): boolean => !isSelect(element) && element.matches(COMBOBOXES);
export const isEditable = (element: Element): boolean => !isCombobox(element) && element.matches(EDITABLES);

export const isVisible = (element: HTMLElement): boolean => {
  const target = element.matches(SECTIONED_DATE_INPUT) && element.parentElement ? element.parentElement : element;
  const style = getComputedStyle(target);
  const rect = target.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 &&
    rect.right > 0 && rect.bottom > 0 && !target.closest("[aria-hidden=true], [inert]");
};

/** True when the control cannot be operated at all. */
export const isInactive = (element: HTMLElement): boolean =>
  ((isInput(element) || isTextArea(element) || isSelect(element)) && element.disabled) ||
  element.closest("fieldset[disabled]") !== null ||
  element.getAttribute("aria-disabled") === "true";

export const isDisabled = (element: HTMLElement): boolean =>
  isInactive(element) ||
  ((isInput(element) || isTextArea(element)) && element.readOnly) ||
  element.getAttribute("aria-readonly") === "true";

export interface DetectionOptions {
  includeFrames: boolean;
  scope: FillScope;
}

function searchRoots(root: Document | ShadowRoot, includeFrames: boolean): Array<Document | ShadowRoot> {
  const roots: Array<Document | ShadowRoot> = [root];
  for (const element of Array.from(root.querySelectorAll("*"))) {
    if (element.shadowRoot) roots.push(...searchRoots(element.shadowRoot, includeFrames));
    if (element.tagName !== "IFRAME" || !includeFrames) continue;
    try {
      const frame = (element as HTMLIFrameElement).contentDocument;
      if (frame) roots.push(...searchRoots(frame, includeFrames));
    } catch {
      // Cross-origin frames are out of reach by design.
    }
  }
  return roots;
}

/** The form the user is working in, or failing that the one with the most fields. */
function selectedForm(document: Document): HTMLFormElement | null {
  const focused = document.activeElement?.closest("form");
  if (focused) return focused;
  const count = (form: HTMLFormElement): number => form.querySelectorAll(NATIVE_FIELDS).length;
  return Array.from(document.forms).sort((a, b) => count(b) - count(a))[0] ?? null;
}

/** Finds every fillable control in the document, its open shadow roots and, optionally, same-origin iframes. */
export function collectFields(document: Document, options: DetectionOptions = { includeFrames: true, scope: "all" }): HTMLElement[] {
  const form = options.scope === "form" ? selectedForm(document) : null;
  const found = searchRoots(document, options.includeFrames).flatMap((root) =>
    Array.from(root.querySelectorAll<HTMLElement>(`${NATIVE_FIELDS}, ${COMBOBOXES}, ${EDITABLES}`))
  );
  return found.filter((element) => {
    if (form && !form.contains(element)) return false;
    if (element.matches(DATE_SECTIONS)) return false;
    if (isEditable(element)) return !element.parentElement?.closest(EDITABLES);
    // A combobox wrapper already owns the input inside it.
    return !element.parentElement?.closest(COMBOBOXES);
  });
}

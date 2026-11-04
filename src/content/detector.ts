export type NativeField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const NATIVE_FIELDS =
  "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=file])" +
  ":not([type=image]):not([type=color]):not([type=range]), textarea, select";
const COMBOBOXES = "[role=combobox], [aria-haspopup=listbox]";
const EDITABLES = "[contenteditable=''], [contenteditable=true]";

// Tag checks rather than instanceof: elements inside iframes belong to a different window.
export const isSelect = (element: Element): element is HTMLSelectElement => element.tagName === "SELECT";
export const isTextArea = (element: Element): element is HTMLTextAreaElement => element.tagName === "TEXTAREA";
export const isInput = (element: Element): element is HTMLInputElement => element.tagName === "INPUT";

export const isChoice = (element: Element): element is HTMLInputElement =>
  isInput(element) && (element.type === "checkbox" || element.type === "radio");
export const isCombobox = (element: Element): boolean => !isSelect(element) && element.matches(COMBOBOXES);
export const isEditable = (element: Element): boolean => !isCombobox(element) && element.matches(EDITABLES);

export const isVisible = (element: HTMLElement): boolean => {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 &&
    rect.right > 0 && rect.bottom > 0 && !element.closest("[aria-hidden=true]");
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

function searchRoots(root: Document | ShadowRoot): Array<Document | ShadowRoot> {
  const roots: Array<Document | ShadowRoot> = [root];
  for (const element of Array.from(root.querySelectorAll("*"))) {
    if (element.shadowRoot) roots.push(...searchRoots(element.shadowRoot));
    if (element.tagName !== "IFRAME") continue;
    try {
      const frame = (element as HTMLIFrameElement).contentDocument;
      if (frame) roots.push(...searchRoots(frame));
    } catch {
      // Cross-origin frames are out of reach by design.
    }
  }
  return roots;
}

/** Finds every fillable control in the document, its open shadow roots and same-origin iframes. */
export function collectFields(document: Document): HTMLElement[] {
  const found = searchRoots(document).flatMap((root) =>
    Array.from(root.querySelectorAll<HTMLElement>(`${NATIVE_FIELDS}, ${COMBOBOXES}, ${EDITABLES}`))
  );
  return found.filter((element) => {
    if (isEditable(element)) return !element.parentElement?.closest(EDITABLES);
    // A combobox wrapper already owns the input inside it.
    return !element.parentElement?.closest(COMBOBOXES);
  });
}

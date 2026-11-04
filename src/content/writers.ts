const fire = (element: HTMLElement, type: string): void => {
  element.dispatchEvent(new Event(type, { bubbles: true }));
};

const fireFocus = (element: HTMLElement, type: "focus" | "focusin" | "blur" | "focusout"): void => {
  element.dispatchEvent(new FocusEvent(type, { bubbles: type === "focusin" || type === "focusout" }));
};

/** Runs a write inside a focus/blur pair, because validators commonly run on blur. */
function withFocusEvents(element: HTMLElement, write: () => void): void {
  fireFocus(element, "focus");
  fireFocus(element, "focusin");
  write();
  fireFocus(element, "blur");
  fireFocus(element, "focusout");
}

/**
 * Uses the prototype's value setter so frameworks that wrap the element's own `value`
 * property, such as React, still see the following input event as a real change.
 * Returns false when the field rejected the value.
 */
export function writeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
  withFocusEvents(element, () => {
    setter?.call(element, value);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    fire(element, "change");
  });
  return element.value !== "";
}

export function writeEditable(element: HTMLElement, value: string): void {
  withFocusEvents(element, () => {
    element.textContent = value;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  });
}

export function writeSelect(select: HTMLSelectElement, value: string): void {
  withFocusEvents(select, () => {
    select.value = value;
    fire(select, "input");
    fire(select, "change");
  });
}

/** A real click, so checkboxes and radios fire the events frameworks listen for. */
export const toggle = (element: HTMLInputElement): void => element.click();

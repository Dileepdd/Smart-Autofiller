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

export function writeMultiSelect(select: HTMLSelectElement, values: string[]): void {
  withFocusEvents(select, () => {
    for (const option of Array.from(select.options)) option.selected = values.includes(option.value);
    fire(select, "input");
    fire(select, "change");
  });
}

/** A real click, so checkboxes and radios fire the events frameworks listen for. */
export const toggle = (element: HTMLInputElement): void => element.click();

/**
 * A last line of defence: if a page's own handler tries to submit while values are being
 * written, that is stopped and reported. The returned function removes the block again.
 */
export function blockSubmissions(onBlocked: () => void): () => void {
  const block = (event: Event): void => {
    event.preventDefault();
    event.stopImmediatePropagation();
    onBlocked();
  };
  window.addEventListener("submit", block, true);
  return () => window.removeEventListener("submit", block, true);
}

const HIGHLIGHT_MS = 2000;

/** Outlines fields briefly. Uses outline because, unlike a border, it cannot shift the page's layout. */
export function highlight(elements: HTMLElement[]): void {
  const previous = elements.map((element) => element.style.outline);
  elements.forEach((element) => { element.style.outline = "2px solid #1e8e3e"; });
  setTimeout(() => elements.forEach((element, index) => { element.style.outline = previous[index]; }), HIGHLIGHT_MS);
}

/** Elements whose click would submit a form or leave the page. */
const canSubmitOrNavigate = (element: HTMLElement): boolean => {
  const control = element.closest<HTMLButtonElement | HTMLInputElement>("button, input[type=submit], input[type=image]");
  return (control !== null && control.type !== "button" && control.form !== null) || element.closest("a[href]") !== null;
};

/**
 * Component libraries differ in which of these they listen to, so a real click's full sequence
 * is sent. The final click is withheld from anything that could submit a form or navigate.
 */
export function press(element: HTMLElement): void {
  const types = ["pointerdown", "mousedown", "pointerup", "mouseup"];
  if (!canSubmitOrNavigate(element)) types.push("click");
  for (const type of types) {
    element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
  }
}

import { UndoResult } from "../shared/types";
import { isInput, isSelect, isTextArea } from "./detector";
import { toggle, writeEditable, writeMultiSelect, writeValue } from "./writers";

type Restore = () => void;

let restores: Restore[] = [];
let notRestorable = 0;

export function startSnapshot(): void {
  restores = [];
  notRestorable = 0;
}

function restoreFor(element: HTMLElement): Restore | undefined {
  if (isSelect(element)) {
    const values = Array.from(element.selectedOptions).map((option) => option.value);
    return () => writeMultiSelect(element, values);
  }
  if (isInput(element) && element.type === "checkbox") {
    const { checked } = element;
    return () => { if (element.checked !== checked) toggle(element); };
  }
  // A radio cannot be cleared by clicking it, and forcing it would leave frameworks out of step.
  if (isInput(element) && element.type === "radio") return undefined;
  if (isInput(element) || isTextArea(element)) {
    const { value } = element;
    return () => writeValue(element, value);
  }
  if (element.isContentEditable) {
    const text = element.textContent ?? "";
    return () => writeEditable(element, text);
  }
  return undefined;
}

/** Call just before a field changes. Fields with no safe way back are counted instead. */
export function remember(element: HTMLElement): void {
  const restore = restoreFor(element);
  if (restore) restores.push(() => { if (element.isConnected) restore(); });
  else notRestorable++;
}

export function undoLastFill(): UndoResult {
  const result = { restored: restores.length, notRestored: notRestorable };
  [...restores].reverse().forEach((restore) => restore());
  startSnapshot();
  return result;
}

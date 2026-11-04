import { DropdownMode } from "../shared/types";
import { isInput, isVisible } from "./detector";
import { Choice, isPlaceholder, pickChoice } from "./dropdown";
import { waitFor } from "./waiting";
import { press, writeValue } from "./writers";

const OPEN_TIMEOUT_MS = 800;
const TYPEAHEAD_TIMEOUT_MS = 1200;
const MAX_VALUE_ANCESTORS = 3;

/** Ant Design shows options without an ARIA role; its role=option list is an invisible stub. */
const UNLABELLED_OPTIONS = ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option:not(.ant-select-item-option-disabled)";

type OptionChoice = Choice & { element: HTMLElement };

function listboxes(trigger: HTMLElement): Element[] {
  const root = trigger.getRootNode() as Document | ShadowRoot;
  const ids = `${trigger.getAttribute("aria-controls") ?? ""} ${trigger.getAttribute("aria-owns") ?? ""}`.split(/\s+/).filter(Boolean);
  const owned = ids.flatMap((id) => root.querySelector(`#${CSS.escape(id)}`) ?? []);
  if (owned.length) return owned;
  // Most libraries portal the open list to the end of the body, so the last one is the newest.
  return Array.from(trigger.ownerDocument.querySelectorAll("[role=listbox]")).slice(-1);
}

function openOptions(trigger: HTMLElement): OptionChoice[] {
  const usable = (options: HTMLElement[]): HTMLElement[] =>
    options.filter((option) => option.getAttribute("aria-disabled") !== "true" && isVisible(option) && !option.closest("a[href]"));
  const aria = usable(listboxes(trigger).flatMap((list) => Array.from(list.querySelectorAll<HTMLElement>("[role=option]"))));
  const options = aria.length ? aria : usable(Array.from(trigger.ownerDocument.querySelectorAll<HTMLElement>(UNLABELLED_OPTIONS)));
  return options
    .map((element) => {
      const label = (element.textContent ?? "").trim();
      return { element, label, value: element.getAttribute("data-value") ?? label };
    })
    .filter(({ label }) => label !== "" && !isPlaceholder(label));
}

// Includes zero-width spaces, which libraries such as MUI render inside an empty select.
const displayedText = (element: Element): string => (element.textContent ?? "").replace(/[\s​]+/g, " ").trim();

const showsValue = (text: string): boolean => text !== "" && !isPlaceholder(text);

/** Some libraries keep their input empty and show the selection beside it, as react-select does. */
function valueBesideInput(input: HTMLElement): boolean {
  let node = input.parentElement;
  for (let depth = 0; node && depth < MAX_VALUE_ANCESTORS; depth++) {
    if (node.querySelector("label, legend, select, textarea")) return false;
    const text = displayedText(node);
    if (text) return showsValue(text);
    node = node.parentElement;
  }
  return false;
}

export function comboboxHasValue(trigger: HTMLElement): boolean {
  const input = isInput(trigger) ? trigger : trigger.querySelector("input");
  if (input?.value.trim()) return true;
  return isInput(trigger) ? valueBesideInput(trigger) : showsValue(displayedText(trigger));
}

/**
 * Opens a role-based dropdown and clicks one option. Only the trigger and elements with
 * role=option are ever clicked, so this cannot reach a submit button or other page action.
 * Returns the selected label, or undefined when nothing could be selected.
 */
export async function fillCombobox(trigger: HTMLElement, targets: string[], query: string, mode: DropdownMode): Promise<string | undefined> {
  press(trigger);
  let opened = await waitFor(() => openOptions(trigger).length > 0, OPEN_TIMEOUT_MS);

  // Type-ahead comboboxes only offer options once the user has typed something.
  const typeable = isInput(trigger) && !trigger.readOnly;
  if (!opened && typeable) {
    writeValue(trigger, query);
    opened = await waitFor(() => openOptions(trigger).length > 0, TYPEAHEAD_TIMEOUT_MS);
    if (!opened) return query;
  }

  const choice = pickChoice(openOptions(trigger), targets, mode);
  if (choice) {
    press(choice.element);
    return choice.label;
  }
  if (trigger.getAttribute("aria-expanded") === "true") press(trigger);
  return undefined;
}

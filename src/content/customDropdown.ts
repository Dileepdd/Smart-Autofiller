import { SelectionMode } from "../shared/types";
import { isInput, isVisible } from "./detector";
import { Choice, isPlaceholder, pickChoice } from "./dropdown";
import { delay, waitFor } from "./waiting";
import { press, writeValue } from "./writers";

const OPEN_TIMEOUT_MS = 800;
/** How long an open list may take to receive its options from a server. */
const LOADING_TIMEOUT_MS = 5000;
const TYPEAHEAD_TIMEOUT_MS = 1200;
const SELECTION_SETTLE_MS = 60;
const MAX_VALUE_ANCESTORS = 3;
const MAX_OPTION_LENGTH = 60;

/** Ant Design shows options without an ARIA role; its role=option list is an invisible stub. */
const UNLABELLED_OPTIONS = ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option:not(.ant-select-item-option-disabled)";

type OptionChoice = Choice & { element: HTMLElement };

function listboxes(trigger: HTMLElement): Element[] {
  const root = trigger.getRootNode() as Document | ShadowRoot;
  const ids = `${trigger.getAttribute("aria-controls") ?? ""} ${trigger.getAttribute("aria-owns") ?? ""}`.split(/\s+/).filter(Boolean);
  const owned = ids.flatMap((id) => root.querySelector(`#${CSS.escape(id)}`) ?? []);
  // Most libraries portal the open list to the end of the body, so the last one is the newest.
  return [...owned, ...Array.from(trigger.ownerDocument.querySelectorAll("[role=listbox]")).slice(-1)];
}

const pageElements = (trigger: HTMLElement): Element[] => Array.from(trigger.ownerDocument.querySelectorAll("*"));

/**
 * For dropdowns with no ARIA roles: the items are whatever repeated text appeared when the
 * trigger was pressed. Anything that could submit, navigate or toggle a control is left out.
 */
function appearedOptions(trigger: HTMLElement, before: Set<Element>): HTMLElement[] {
  const groups = new Map<string, HTMLElement[]>();
  for (const element of pageElements(trigger)) {
    if (before.has(element) || element.children.length > 0) continue;
    const text = (element.textContent ?? "").trim();
    if (!text || text.length > MAX_OPTION_LENGTH || element.closest("a[href], label, input, select, textarea, [type=submit]")) continue;
    const key = `${element.tagName}.${element.getAttribute("class") ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), element as HTMLElement]);
  }
  return [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? [];
}

function openOptions(trigger: HTMLElement, before: Set<Element>): OptionChoice[] {
  const usable = (options: HTMLElement[]): HTMLElement[] =>
    options.filter((option) => option.getAttribute("aria-disabled") !== "true" && isVisible(option) && !option.closest("a[href]"));
  const aria = usable(listboxes(trigger).flatMap((list) => Array.from(list.querySelectorAll<HTMLElement>("[role=option]"))));
  const known = aria.length ? aria : usable(Array.from(trigger.ownerDocument.querySelectorAll<HTMLElement>(UNLABELLED_OPTIONS)));
  const options = known.length ? known : usable(appearedOptions(trigger, before));
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

/** The selection a person can see, or an empty string. */
export function comboboxValue(trigger: HTMLElement): string {
  const input = isInput(trigger) ? trigger : trigger.querySelector("input");
  const text = input?.value.trim() || displayedText(trigger);
  return showsValue(text) ? text : "";
}

const isOpen = (trigger: HTMLElement, before: Set<Element>): boolean =>
  trigger.getAttribute("aria-expanded") === "true" || listboxes(trigger).length > 0 ||
  pageElements(trigger).some((element) => !before.has(element));

/** True for the option already chosen. Clicking that again would clear it in a clearable dropdown. */
const isAlreadySelected = ({ element, label }: OptionChoice, selected: string): boolean =>
  element.getAttribute("aria-selected") === "true" || element.hasAttribute("data-checked") || selected === label;

/**
 * Opens a role-based dropdown and clicks one option. Only the trigger and elements with
 * role=option are ever clicked, so this cannot reach a submit button or other page action.
 * Returns the selected label, or undefined when nothing could be selected.
 */
export async function fillCombobox(trigger: HTMLElement, targets: string[], query: string, mode: SelectionMode): Promise<string | undefined> {
  const selected = comboboxValue(trigger);
  const before = new Set(pageElements(trigger));
  press(trigger);
  const hasOptions = (): boolean => openOptions(trigger, before).length > 0;
  let opened = await waitFor(hasOptions, OPEN_TIMEOUT_MS);
  // An open list with nothing in it yet is still loading.
  if (!opened && isOpen(trigger, before)) opened = await waitFor(hasOptions, LOADING_TIMEOUT_MS);

  // Type-ahead comboboxes only offer options once the user has typed something.
  const typeable = isInput(trigger) && !trigger.readOnly;
  if (!opened && typeable) {
    writeValue(trigger, query);
    opened = await waitFor(hasOptions, TYPEAHEAD_TIMEOUT_MS);
    if (!opened) return trigger.value.trim() ? query : undefined;
  }

  const choice = pickChoice(openOptions(trigger, before), targets, mode);
  if (choice && !isAlreadySelected(choice, selected)) press(choice.element);
  // Never leave a list open over the form.
  else if (isOpen(trigger, before)) press(trigger);
  if (!choice) return undefined;

  await delay(SELECTION_SETTLE_MS);
  return comboboxHasValue(trigger) ? choice.label : undefined;
}

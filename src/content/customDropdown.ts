import { SelectionMode } from "../shared/types";
import { isInput, isVisible } from "./detector";
import { Choice, hasMatch, isPlaceholder, pickChoice } from "./dropdown";
import { delay, waitFor } from "./waiting";
import { press, pressEscape, writeValue } from "./writers";

const OPEN_TIMEOUT_MS = 800;
/** How long an open list may take to receive its options from a server. */
const LOADING_TIMEOUT_MS = 5000;
const TYPEAHEAD_TIMEOUT_MS = 1200;
const SELECTION_SETTLE_MS = 60;
const CLOSE_TIMEOUT_MS = 400;
/** A popup can keep the page hidden from assistive technology until its closing animation ends. */
const PAGE_RETURN_TIMEOUT_MS = 1000;
const MAX_VALUE_ANCESTORS = 3;
const MAX_OPTION_LENGTH = 60;

/** Ant Design shows options without an ARIA role; its role=option list is an invisible stub. Element UI has no roles at all. */
const UNLABELLED_OPTIONS =
  ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option:not(.ant-select-item-option-disabled), " +
  ".el-select-dropdown .el-select-dropdown__item:not(.is-disabled)";

/** Element UI reuses one hidden panel for each select, so only its visibility shows it is open. */
const REUSED_POPUP = ".el-select-dropdown";
const POPUPS = `[role=listbox], [role=dialog], dialog[open], ${REUSED_POPUP}`;

/** What an open list shows once a server has answered with nothing, so there is no point in waiting on. */
const EMPTY_LIST = /^no (results?|options?|data|matches|records?)\b/i;

/** Rows and messages that sit among the options but must never be picked. */
const NOT_AN_OPTION = /^((clear|reset)( (selection|value|all))?|no (results?|options?|data|matches)\b.*|(loading|searching|load more|show more)\b.*)$/i;

const BUTTONS = "button, [role=button]";

/** A button is only an option among other rows like it, and never when it reads as an action. */
const MIN_BUTTON_ROWS = 2;
const ACTION_BUTTON = /^(save|submit|apply|ok|okay|done|confirm|cancel|close|delete|remove|send|continue|finish)\b/i;

type OptionChoice = Choice & { element: HTMLElement };

function listboxes(trigger: HTMLElement): Element[] {
  const root = trigger.getRootNode() as Document | ShadowRoot;
  const ids = `${trigger.getAttribute("aria-controls") ?? ""} ${trigger.getAttribute("aria-owns") ?? ""}`.split(/\s+/).filter(Boolean);
  const owned = ids.flatMap((id) => root.querySelector(`#${CSS.escape(id)}`) ?? []);
  // Most libraries portal the open list to the end of the body, so the last one is the newest.
  return [...owned, ...Array.from(trigger.ownerDocument.querySelectorAll("[role=listbox]")).slice(-1)];
}

const pageElements = (trigger: HTMLElement): Element[] => Array.from(trigger.ownerDocument.querySelectorAll("*"));

/** Popups the press opened. One that is closing no longer counts. */
const openPopups = (trigger: HTMLElement, before: Set<Element>): HTMLElement[] =>
  Array.from(trigger.ownerDocument.querySelectorAll<HTMLElement>(POPUPS)).filter((popup) =>
    (!before.has(popup) || popup.matches(REUSED_POPUP)) && popup.getAttribute("data-state") !== "closed" && isVisible(popup));

const hasOpenPopup = (trigger: HTMLElement, before: Set<Element>): boolean =>
  trigger.getAttribute("aria-expanded") === "true" || openPopups(trigger, before).length > 0;

/** A drawer of records to tick and apply is not a list of options. */
const opensRecordTable = (trigger: HTMLElement, before: Set<Element>): boolean =>
  openPopups(trigger, before).some((popup) => popup.querySelector("table") !== null);

const showsNoOptions = (trigger: HTMLElement, before: Set<Element>): boolean =>
  openPopups(trigger, before).some((popup) => EMPTY_LIST.test((popup.textContent ?? "").trim()));

/** A list the library labels as one is still loading when it has no options, so nothing else in it is an option. */
const opensKnownList = (trigger: HTMLElement, before: Set<Element>): boolean =>
  openPopups(trigger, before).some((popup) => popup.matches(`[role=listbox], ${REUSED_POPUP}`) || popup.querySelector("[role=listbox]") !== null);

/**
 * For dropdowns with no ARIA roles: the items are whatever repeated text appeared when the
 * trigger was pressed. Anything that could submit, navigate or toggle a control is left out,
 * and so is any button that is not one of a list of rows.
 */
function appearedOptions(trigger: HTMLElement, before: Set<Element>): HTMLElement[] {
  const groups = new Map<string, HTMLElement[]>();
  for (const element of pageElements(trigger)) {
    if (before.has(element) || element.children.length > 0) continue;
    const text = (element.textContent ?? "").trim();
    if (!text || text.length > MAX_OPTION_LENGTH || element.closest("a[href], label, input, select, textarea, [type=submit]")) continue;
    if (element.closest(BUTTONS) && ACTION_BUTTON.test(text)) continue;
    const key = `${element.tagName}.${element.getAttribute("class") ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), element as HTMLElement]);
  }
  const largest = [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  return largest.length < MIN_BUTTON_ROWS && largest[0]?.closest(BUTTONS) ? [] : largest;
}

function openOptions(trigger: HTMLElement, before: Set<Element>): OptionChoice[] {
  const usable = (options: HTMLElement[]): HTMLElement[] =>
    options.filter((option) => option.getAttribute("aria-disabled") !== "true" && isVisible(option) && !option.closest("a[href]"));
  const aria = usable(listboxes(trigger).flatMap((list) => Array.from(list.querySelectorAll<HTMLElement>("[role=option]"))));
  const known = aria.length ? aria : usable(Array.from(trigger.ownerDocument.querySelectorAll<HTMLElement>(UNLABELLED_OPTIONS)));
  const guessable = !opensKnownList(trigger, before) && !opensRecordTable(trigger, before);
  const options = known.length || !guessable ? known : usable(appearedOptions(trigger, before));
  return options
    .map((element) => {
      const label = (element.textContent ?? "").trim();
      return { element, label, value: element.getAttribute("data-value") ?? label };
    })
    .filter(({ label }) => label !== "" && !isPlaceholder(label) && !NOT_AN_OPTION.test(label));
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
  trigger.getAttribute("aria-expanded") === "true" || listboxes(trigger).some((list) => isVisible(list as HTMLElement)) ||
  pageElements(trigger).some((element) => !before.has(element));

/**
 * True for the option already chosen. Clicking that again would clear it in a clearable dropdown.
 * cmdk sets aria-selected on the highlighted row, which is the first one whatever the value is.
 */
const isAlreadySelected = ({ element, label }: OptionChoice, selected: string): boolean =>
  selected === label ||
  (!element.hasAttribute("cmdk-item") && (element.getAttribute("aria-selected") === "true" || element.hasAttribute("data-checked")));

/** Some lists ignore a press on their trigger, and an open one can hide the rest of the page. */
async function closeList(trigger: HTMLElement, before: Set<Element>): Promise<void> {
  if (!isOpen(trigger, before)) return;
  if (hasOpenPopup(trigger, before)) {
    pressEscape(trigger);
    if (await waitFor(() => !hasOpenPopup(trigger, before), CLOSE_TIMEOUT_MS)) return;
  }
  press(trigger);
}

/** Fields behind an open popup look hidden, so the fill must not move on until the page is back. */
const pageReturned = (trigger: HTMLElement): Promise<boolean> =>
  waitFor(() => !trigger.isConnected || isVisible(trigger), PAGE_RETURN_TIMEOUT_MS);

/**
 * Opens a dropdown and clicks one option. Only the trigger and its options are ever clicked,
 * never a button, so this cannot reach a submit button or other page action.
 * Returns the selected label, or undefined when nothing could be selected.
 */
export async function fillCombobox(trigger: HTMLElement, targets: string[], query: string, mode: SelectionMode): Promise<string | undefined> {
  const selected = comboboxValue(trigger);
  const before = new Set(pageElements(trigger));
  press(trigger);
  const hasOptions = (): boolean => openOptions(trigger, before).length > 0;
  const settled = (): boolean => hasOptions() || opensRecordTable(trigger, before);
  await waitFor(settled, OPEN_TIMEOUT_MS);
  // An open list with nothing in it yet is still loading, unless it says it found nothing.
  if (!settled() && isOpen(trigger, before)) await waitFor(() => settled() || showsNoOptions(trigger, before), LOADING_TIMEOUT_MS);
  let opened = hasOptions();

  // Type-ahead comboboxes only offer options once the user has typed something.
  const typeable = isInput(trigger) && !trigger.readOnly;
  if (!opened && typeable) {
    writeValue(trigger, query);
    opened = await waitFor(hasOptions, TYPEAHEAD_TIMEOUT_MS);
    if (!opened) {
      const typed = trigger.value.trim();
      await closeList(trigger, before);
      await pageReturned(trigger);
      return typed ? query : undefined;
    }
  }

  const options = openOptions(trigger, before);
  // A value already there beats an arbitrary first row, and the list may only be showing its first page.
  if (mode === "match" && selected && targets.length > 0 && !hasMatch(options, targets)) {
    await closeList(trigger, before);
    await pageReturned(trigger);
    return selected;
  }
  const choice = pickChoice(options, targets, mode);
  if (choice && !isAlreadySelected(choice, selected)) {
    press(choice.element);
    await delay(SELECTION_SETTLE_MS);
    // Closing by itself is the usual case, and Escape must not reach anything behind a list that already went.
    if (!(await waitFor(() => !hasOpenPopup(trigger, before), CLOSE_TIMEOUT_MS))) await closeList(trigger, before);
  } else {
    // Never leave a list open over the form.
    await closeList(trigger, before);
  }
  await pageReturned(trigger);
  if (!choice) return undefined;
  // A form may replace the field once it has a value, which is a success this element can no longer show.
  return !trigger.isConnected || comboboxHasValue(trigger) ? choice.label : undefined;
}

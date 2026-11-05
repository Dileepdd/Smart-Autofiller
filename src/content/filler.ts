import { adoptCity, adoptCountry, adoptRegion, createProfile, dropdownTargets, Profile } from "../generators/profile";
import { customRuleValue, dateCandidates, generateValue, isDateKind, pickDate } from "../generators/values";
import { AutofillSettings, FillResult, SelectionMode } from "../shared/types";
import { classifyField, FieldKind, getFieldDescription } from "./classifier";
import { choiceLabel } from "./context";
import { comboboxHasValue, comboboxValue, fillCombobox } from "./customDropdown";
import { isFlatpickr, pickFlatpickrDate, writeFirstAcceptedDate } from "./datePicker";
import { collectFields, isChoice, isCombobox, isDisabled, isEditable, isInactive, isInput, isSelect, isVisible } from "./detector";
import { hasSelection, pickChoice, pickMany, toChoice, usableOptions } from "./dropdown";
import { remember, startSnapshot } from "./undo";
import { delay, waitFor } from "./waiting";
import { highlight, toggle, writeEditable, writeMultiSelect, writeSelect, writeValue } from "./writers";

/** Rescans catch fields revealed by earlier selections; the limit stops pages that keep re-rendering. */
const MAX_PASSES = 4;
const SETTLE_MS = 150;
const DROPDOWN_TICK_MS = 30;
const DEPENDENT_WAIT_MS = 2500;
/** Bounds a page full of dropdowns that never open, which each cost a timeout. */
const DROPDOWN_BUDGET_MS = 20000;
const MAX_REPORT_LINES = 50;
/** These repeat an earlier field on purpose, so they must keep its value. */
const CONFIRMATION = /\b(confirm|confirmation|retype|re ?enter|repeat|verify)\b/;

/** Parents go first so that dependent lists have loaded, and the profile has settled, before their children. */
const DROPDOWN_ORDER: readonly FieldKind[] = ["country", "state", "city"];

interface FillRun {
  settings: AutofillSettings;
  profile: Profile;
  result: FillResult;
  /** Fields with a final outcome. Anything else is looked at again on the next pass. */
  done: WeakSet<HTMLElement>;
  skipped: Set<HTMLElement>;
  written: Array<HTMLInputElement | HTMLTextAreaElement>;
  filledFields: HTMLElement[];
  /** How many fields of each kind have been written, for making repeats unique. */
  kindCounts: Map<FieldKind, number>;
  changed: boolean;
}

const settle = (run: FillRun, element: HTMLElement): void => {
  run.done.add(element);
  run.skipped.delete(element);
};

const markFilled = (run: FillRun, element: HTMLElement): void => {
  settle(run, element);
  run.filledFields.push(element);
  run.result.filled++;
  run.changed = true;
};

const markSkipped = (run: FillRun, element: HTMLElement): void => {
  run.done.add(element);
  run.skipped.add(element);
};

const markFailed = (run: FillRun, element: HTMLElement, reason: string): void => {
  settle(run, element);
  run.result.errors++;
  run.result.details.push(`${reason}: ${describe(element)}`);
};

const markUnsupported = (run: FillRun, element: HTMLElement, reason: string): void => {
  settle(run, element);
  run.result.unsupported++;
  run.result.details.push(`${reason}: ${describe(element)}`);
};

const describe = (element: HTMLElement): string => getFieldDescription(element).slice(0, 100) || element.tagName.toLowerCase();

const customValue = (run: FillRun, element: HTMLElement): string | undefined =>
  customRuleValue(getFieldDescription(element), run.settings, run.profile);

function adoptChoice(run: FillRun, kind: FieldKind, label: string): void {
  if (kind === "country") adoptCountry(run.profile, label, run.settings);
  if (kind === "state") adoptRegion(run.profile, label);
  if (kind === "city") adoptCity(run.profile, label);
}

/** A custom rule names the exact option it wants, whatever the dropdown preference is. */
function selection(run: FillRun, element: HTMLElement, kind: FieldKind, mode: SelectionMode): { targets: string[]; mode: SelectionMode } {
  const custom = customValue(run, element);
  return custom ? { targets: [custom], mode: "match" } : { targets: dropdownTargets(kind, run.profile), mode };
}

function fillSelect(run: FillRun, select: HTMLSelectElement, kind: FieldKind): void {
  if (kind === "skip" && customValue(run, select) === undefined) return markSkipped(run, select);
  const choices = usableOptions(select).map(toChoice);
  remember(select);
  if (select.multiple && customValue(run, select) === undefined) {
    writeMultiSelect(select, pickMany(choices, run.settings.multiSelectMode).map(({ value }) => value));
    return markFilled(run, select);
  }
  const { targets, mode } = selection(run, select, kind, run.settings.dropdownMode);
  const choice = pickChoice(choices, targets, mode);
  if (!choice) return markSkipped(run, select);
  writeSelect(select, choice.value);
  adoptChoice(run, kind, choice.label);
  markFilled(run, select);
}

async function fillComboboxField(run: FillRun, trigger: HTMLElement, kind: FieldKind): Promise<void> {
  if (kind === "skip") return markSkipped(run, trigger);
  const { targets, mode } = selection(run, trigger, kind, run.settings.dropdownMode);
  const query = targets[0] ?? generateValue(kind, run.settings, run.profile);
  remember(trigger);
  const label = await fillCombobox(trigger, targets, query, mode);
  if (!label) {
    adoptShownValue(run, trigger, kind);
    return markFailed(run, trigger, "Could not select an option");
  }
  adoptChoice(run, kind, label);
  markFilled(run, trigger);
}

/** A dropdown that may still be waiting for a parent selection to enable or populate it. */
const isPending = (element: HTMLElement): boolean =>
  isInactive(element) || (isSelect(element) && usableOptions(element).length === 0);

function shownValue(element: HTMLElement): string {
  if (isSelect(element)) return hasSelection(element) ? element.options[element.selectedIndex].text.trim() : "";
  if (isCombobox(element)) return comboboxValue(element);
  return isInput(element) ? element.value.trim() : "";
}

function adoptShownValue(run: FillRun, element: HTMLElement, kind: FieldKind): void {
  const value = shownValue(element);
  if (value) adoptChoice(run, kind, value);
}

/** Location already on the page and staying there must drive the data, or a US form gets an Indian ZIP. */
function adoptPresetLocation(run: FillRun, fields: HTMLElement[]): void {
  const presets = fields.flatMap((element) => {
    const kind = classifyField(element);
    const locked = isSelect(element) || isCombobox(element) ? isInactive(element) : isDisabled(element);
    return DROPDOWN_ORDER.includes(kind) && (locked || !run.settings.fillExisting) ? [{ element, kind }] : [];
  });
  for (const kind of DROPDOWN_ORDER) {
    presets.filter((preset) => preset.kind === kind).forEach(({ element }) => adoptShownValue(run, element, kind));
  }
}

async function fillDropdowns(run: FillRun, dropdowns: HTMLElement[]): Promise<void> {
  const deadline = Date.now() + DROPDOWN_BUDGET_MS;
  const kinds = new Map(dropdowns.map((element) => [element, classifyField(element)]));
  const rank = (element: HTMLElement): number => {
    const index = DROPDOWN_ORDER.indexOf(kinds.get(element) ?? "text");
    return index < 0 ? DROPDOWN_ORDER.length : index;
  };
  let queue = [...dropdowns].sort((a, b) => rank(a) - rank(b));

  while (queue.length) {
    const pending: HTMLElement[] = [];
    for (const element of queue) {
      const kind = kinds.get(element) ?? "text";
      if (!element.isConnected || !isVisible(element)) { run.skipped.add(element); continue; }
      if (Date.now() > deadline) { markFailed(run, element, "Ran out of time"); continue; }
      if (isSelect(element) && !run.settings.fillExisting && hasSelection(element)) { markSkipped(run, element); continue; }
      if (!isSelect(element) && !run.settings.fillExisting && comboboxHasValue(element)) { markSkipped(run, element); continue; }
      if (isPending(element)) { pending.push(element); continue; }

      try {
        if (isSelect(element)) fillSelect(run, element, kind);
        else await fillComboboxField(run, element, kind);
      } catch {
        markFailed(run, element, "Could not fill");
      }
      // Lets the framework react before the next dropdown is read.
      await delay(DROPDOWN_TICK_MS);
    }

    const canUnblock = run.settings.detectDynamic && run.changed && pending.length > 0;
    if (!canUnblock || !(await waitFor(() => pending.some((element) => !isPending(element)), DEPENDENT_WAIT_MS))) {
      pending.forEach((element) => markSkipped(run, element));
      return;
    }
    queue = pending;
  }
}

function fillChoiceGroup(run: FillRun, element: HTMLInputElement): void {
  if (element.type === "checkbox") {
    // Optional boxes are often marketing or consent choices, so by default only required ones are ticked.
    const required = element.required || element.getAttribute("aria-required") === "true";
    const { checkboxMode } = run.settings;
    const wanted = checkboxMode === "all" || (checkboxMode === "required" && required);
    if (!wanted || element.checked) return markSkipped(run, element);
    remember(element);
    toggle(element);
    return markFilled(run, element);
  }

  const root = element.getRootNode() as Document | ShadowRoot;
  const group = element.name
    ? Array.from(root.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${CSS.escape(element.name)}"]`))
      .filter((radio) => radio.form === element.form)
    : [element];
  // A group is decided once and counts as a single field.
  group.forEach((radio) => settle(run, radio));
  const available = group.filter((radio) => isVisible(radio) && !isDisabled(radio));
  const choices = available.map((radio) => ({ label: choiceLabel(radio) || radio.value, value: radio.value, radio }));
  const { targets, mode } = selection(run, element, classifyField(element), run.settings.radioMode);
  const choice = group.some((radio) => radio.checked) ? undefined : pickChoice(choices, targets, mode);
  if (!choice) return markSkipped(run, element);
  remember(choice.radio);
  toggle(choice.radio);
  markFilled(run, choice.radio);
}

async function fillTextDate(run: FillRun, element: HTMLInputElement, kind: "dateOfBirth" | "date" | "futureDate"): Promise<void> {
  const candidates = dateCandidates(pickDate(kind, run.profile, run.settings), run.settings, element);
  remember(element);
  if (!(await writeFirstAcceptedDate(element, candidates))) return markUnsupported(run, element, "Unsupported date picker");
  run.written.push(element);
  markFilled(run, element);
}

async function fillFlatpickr(run: FillRun, element: HTMLInputElement): Promise<void> {
  if (!run.settings.fillExisting && element.value.trim() !== "") return markSkipped(run, element);
  const kind = classifyField(element);
  const date = pickDate(isDateKind(kind) ? kind : "date", run.profile, run.settings);
  if (await pickFlatpickrDate(element, date)) return markFilled(run, element);
  markUnsupported(run, element, "Unsupported date picker");
}

function repeatIndex(run: FillRun, element: HTMLElement, kind: FieldKind): number {
  if (!run.settings.uniqueValues || CONFIRMATION.test(getFieldDescription(element))) return 0;
  const seen = run.kindCounts.get(kind) ?? 0;
  run.kindCounts.set(kind, seen + 1);
  return seen;
}

async function fillText(run: FillRun, element: HTMLInputElement | HTMLTextAreaElement): Promise<void> {
  if (!run.settings.fillExisting && element.value.trim() !== "") return markSkipped(run, element);

  const kind = classifyField(element);
  const custom = customValue(run, element);
  if (kind === "skip" && custom === undefined) return markSkipped(run, element);
  if (custom === undefined && isDateKind(kind) && isInput(element) && element.type !== "date") return fillTextDate(run, element, kind);

  const value = custom ?? generateValue(kind === "skip" ? "text" : kind, run.settings, run.profile, element, repeatIndex(run, element, kind));
  // Only an excluded value, such as the middle name when that setting is off, comes back empty.
  if (value === "") return markSkipped(run, element);
  remember(element);
  if (!writeValue(element, value)) return markFailed(run, element, "Field rejected the value");
  if (element.validity && !element.validity.valid) {
    // Preserve the generated value but report fields that need a custom rule.
    run.result.details.push(`Check validation: ${describe(element)}`);
  }
  run.written.push(element);
  markFilled(run, element);
}

/** Widgets such as date pickers can discard a value after blur, so success is only known once the page settles. */
function reportClearedFields(run: FillRun): void {
  for (const element of run.written) {
    if (!element.isConnected) continue;
    if (element.value === "") {
      run.result.filled--;
      run.result.errors++;
      run.result.details.push(`Field cleared the value: ${describe(element)}`);
    } else if (element.getAttribute("aria-invalid") === "true") {
      run.result.details.push(`Check validation: ${describe(element)}`);
    }
  }
}

function fillEditable(run: FillRun, element: HTMLElement): void {
  if (!run.settings.fillExisting && (element.textContent ?? "").trim() !== "") return markSkipped(run, element);
  const kind = classifyField(element);
  if (kind === "skip") return markSkipped(run, element);
  remember(element);
  writeEditable(element, customValue(run, element) ?? generateValue(kind, run.settings, run.profile));
  markFilled(run, element);
}

async function fillField(run: FillRun, element: HTMLElement): Promise<void> {
  if (run.done.has(element)) return;
  // flatpickr marks its input readonly because the calendar is the only way to set it.
  const calendarOnly = isInput(element) && isFlatpickr(element) && !isInactive(element);
  // Left open, not final: an earlier selection may still reveal or enable this field.
  if (!element.isConnected || !isVisible(element) || (isDisabled(element) && !calendarOnly)) { run.skipped.add(element); return; }
  try {
    if (calendarOnly) await fillFlatpickr(run, element);
    else if (isEditable(element)) fillEditable(run, element);
    else if (isChoice(element)) fillChoiceGroup(run, element);
    else await fillText(run, element as HTMLInputElement | HTMLTextAreaElement);
  } catch {
    markFailed(run, element, "Could not fill");
  }
}

/**
 * A last line of defence: if a page's own handler tries to submit while values are being
 * written, that is stopped and reported. Removed again when the fill ends.
 */
function blockSubmissions(run: FillRun): () => void {
  const block = (event: Event): void => {
    event.preventDefault();
    event.stopImmediatePropagation();
    run.result.details.push("Blocked a form submission during the fill.");
  };
  window.addEventListener("submit", block, true);
  return () => window.removeEventListener("submit", block, true);
}

const isDropdown = (element: HTMLElement): boolean => {
  if (isSelect(element)) return true;
  return isCombobox(element) && !(isInput(element) && isDateKind(classifyField(element)));
};

async function fillPasses(run: FillRun): Promise<void> {
  const { detectDynamic, includeFrames, fillScope } = run.settings;
  for (let pass = 0; pass < (detectDynamic ? MAX_PASSES : 1); pass++) {
    const fields = collectFields(document, { includeFrames, scope: fillScope }).filter((element) => !run.done.has(element));
    run.changed = false;

    adoptPresetLocation(run, fields);
    await fillDropdowns(run, fields.filter(isDropdown));
    for (const element of fields.filter((field) => !isDropdown(field))) await fillField(run, element);

    if (!run.changed) break;
    await delay(SETTLE_MS);
  }
}

/** Lists each field by its description. Generated values are left out on purpose. */
function addDetailedReport(run: FillRun): void {
  const lines = [
    ...run.filledFields.map((element) => `Filled: ${describe(element)}`),
    ...[...run.skipped].map((element) => `Skipped: ${describe(element)}`)
  ];
  run.result.details.push(...lines.slice(0, MAX_REPORT_LINES));
  if (lines.length > MAX_REPORT_LINES) run.result.details.push(`And ${lines.length - MAX_REPORT_LINES} more.`);
}

export async function fillPage(settings: AutofillSettings): Promise<FillResult> {
  const run: FillRun = {
    settings,
    profile: createProfile(settings),
    result: { filled: 0, skipped: 0, errors: 0, unsupported: 0, details: [] },
    done: new WeakSet(),
    skipped: new Set(),
    written: [],
    filledFields: [],
    kindCounts: new Map(),
    changed: false
  };
  startSnapshot();

  const allowSubmissions = blockSubmissions(run);
  try {
    await fillPasses(run);
  } finally {
    allowSubmissions();
  }

  reportClearedFields(run);
  run.result.skipped = run.skipped.size;
  if (settings.detailedReport) addDetailedReport(run);
  if (settings.highlightFilled) highlight(run.filledFields);
  return run.result;
}

import { adoptCity, adoptCountry, adoptNames, adoptRegion, createProfile, dropdownTargets, Profile } from "../generators/profile";
import type { DatasetRow } from "../shared/dataset";
import { createRowMatcher, isoDate, isTruthy, RowMatcher } from "./datasetMatch";
import { customRuleValue, dateCandidates, generateValue, isDateKind, pickDate } from "../generators/values";
import { AutofillSettings, FillResult, SelectionMode } from "../shared/types";
import { classifyField, FieldKind, getFieldDescription } from "./classifier";
import { choiceLabel, isRequired } from "./context";
import { comboboxHasValue, comboboxValue, fillCombobox } from "./customDropdown";
import { isFlatpickr, pickFlatpickrDate, writeFirstAcceptedDate } from "./datePicker";
import { collectFields, isChoice, isCombobox, isDisabled, isEditable, isInactive, isInput, isSelect, isVisible } from "./detector";
import { hasMatch, hasSelection, pickChoice, pickMany, toChoice, usableOptions } from "./dropdown";
import { remember, startSnapshot } from "./undo";
import { countTypes, rememberFill, reportIssues } from "./report";
import { validationReport } from "./validation";
import { delay, waitFor } from "./waiting";
import { blockSubmissions, highlight, toggle, writeEditable, writeMultiSelect, writeSelect, writeValue } from "./writers";

/** Rescans catch fields revealed by earlier selections; the limit stops pages that keep re-rendering. */
const MAX_PASSES = 4;
const SETTLE_MS = 150;
const DROPDOWN_TICK_MS = 30;
const DEPENDENT_WAIT_MS = 2500;
/** Bounds a page full of dropdowns that never open, which each cost a timeout. */
const DROPDOWN_BUDGET_MS = 30000;
const MAX_REPORT_LINES = 50;
const COULD_NOT_SELECT = "Could not select an option";
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
  /** Custom dropdowns left alone because that setting is off. */
  skippedDropdowns: number;
  /** Dropdowns that failed once, with the dropdown count at that moment. A later selection may be what they needed. */
  unselected: Map<HTMLElement, number>;
  dropdownsFilled: number;
  /** Location levels this fill changed, whose children now have to load. */
  changedParents: Set<FieldKind>;
  /** The dataset row this fill uses, if any. */
  row?: RowMatcher;
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

/** In a test data mode a page refusing the value is often the point, so it is reported but not a problem. */
const markRejected = (run: FillRun, element: HTMLElement): void => {
  if (run.settings.dataMode === "valid") return markFailed(run, element, "Field rejected the value");
  settle(run, element);
  run.result.details.push(`Field rejected the value: ${describe(element)}`);
};

const describe = (element: HTMLElement): string => getFieldDescription(element).slice(0, 100) || element.tagName.toLowerCase();

/** The dataset row's value for a field, which wins over custom rules and generated data. */
function datasetValue(run: FillRun, element: HTMLElement): string | undefined {
  const entry = run.row?.valueFor(element);
  return entry && "value" in entry ? entry.value : undefined;
}

/** A matched column with an empty cell, when blank cells should leave the field alone. */
const datasetSkips = (run: FillRun, element: HTMLElement): boolean => {
  const entry = run.row?.valueFor(element);
  return entry !== undefined && "skip" in entry;
};

const NO_DATASET_OPTION = "No option matches the dataset value";

const customValue = (run: FillRun, element: HTMLElement): string | undefined =>
  datasetValue(run, element) ?? customRuleValue(getFieldDescription(element), run.settings, run.profile);

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
  if (datasetValue(run, select) !== undefined && !hasMatch(choices, targets)) return markFailed(run, select, NO_DATASET_OPTION);
  const choice = pickChoice(choices, targets, mode);
  if (!choice) return markSkipped(run, select);
  if (select.value !== choice.value) run.changedParents.add(kind);
  writeSelect(select, choice.value);
  adoptChoice(run, kind, choice.label);
  markFilled(run, select);
}

async function fillComboboxField(run: FillRun, trigger: HTMLElement, kind: FieldKind): Promise<void> {
  if (kind === "skip") return markSkipped(run, trigger);
  const { targets, mode } = selection(run, trigger, kind, run.settings.dropdownMode);
  const query = targets[0] ?? generateValue(kind, { ...run.settings, dataMode: "valid" }, run.profile);
  remember(trigger);
  const previous = comboboxValue(trigger);
  const label = await fillCombobox(trigger, targets, query, mode, datasetValue(run, trigger) !== undefined);
  if (!label) {
    adoptShownValue(run, trigger, kind);
    if (!run.settings.fillDependentDropdowns || run.unselected.has(trigger)) return markFailed(run, trigger, COULD_NOT_SELECT);
    run.unselected.set(trigger, run.dropdownsFilled);
    return;
  }
  if (label !== previous) run.changedParents.add(kind);
  adoptChoice(run, kind, label);
  run.unselected.delete(trigger);
  run.dropdownsFilled++;
  markFilled(run, trigger);
}

/** Waiting on a dependent custom dropdown is slow, so that is opt-in. A native select is read at once and always followed. */
const waitsOnDependents = (run: FillRun, element: HTMLElement): boolean => isSelect(element) || run.settings.fillDependentDropdowns;

/** With dependent dropdowns off, a custom list this fill has just reset is left alone rather than waited for. */
const dependsOnThisFill = (run: FillRun, element: HTMLElement, kind: FieldKind): boolean =>
  !waitsOnDependents(run, element) &&
  ((kind === "state" && run.changedParents.has("country")) || (kind === "city" && (run.changedParents.has("country") || run.changedParents.has("state"))));

/** Only a later selection can change what a failed dropdown offers. */
const awaitsParent = (run: FillRun, element: HTMLElement): boolean => run.unselected.get(element) === run.dropdownsFilled;

function reportUnselected(run: FillRun): void {
  for (const element of run.unselected.keys()) {
    if (element.isConnected && !run.done.has(element)) markFailed(run, element, COULD_NOT_SELECT);
  }
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
    const staying = locked || !run.settings.fillExisting || (isCombobox(element) && !run.settings.fillCustomDropdowns) ||
      (run.settings.requiredOnly && !isRequired(element));
    return DROPDOWN_ORDER.includes(kind) && staying ? [{ element, kind }] : [];
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
      if (awaitsParent(run, element)) continue;
      if (!element.isConnected || !isVisible(element)) { run.skipped.add(element); continue; }
      if (!isSelect(element) && !run.settings.fillCustomDropdowns) { markSkipped(run, element); run.skippedDropdowns++; continue; }
      if (Date.now() > deadline) { markFailed(run, element, "Ran out of time"); continue; }
      if (isSelect(element) && !run.settings.fillExisting && hasSelection(element)) { markSkipped(run, element); continue; }
      if (!isSelect(element) && !run.settings.fillExisting && comboboxHasValue(element)) { markSkipped(run, element); continue; }
      if (dependsOnThisFill(run, element, kind)) { markSkipped(run, element); continue; }
      if (datasetSkips(run, element)) { markSkipped(run, element); continue; }
      if (isPending(element)) {
        if (waitsOnDependents(run, element)) pending.push(element);
        else markSkipped(run, element);
        continue;
      }

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
    const fromSheet = datasetValue(run, element);
    if (fromSheet !== undefined) {
      // A sheet says yes or no for each box, so it can untick one as well as tick it.
      if (element.checked === isTruthy(fromSheet)) return markSkipped(run, element);
      remember(element);
      toggle(element);
      return markFilled(run, element);
    }
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
  const fromSheet = group.map((radio) => datasetValue(run, radio)).find((value) => value !== undefined);
  if (fromSheet !== undefined) {
    // A sheet picks the radio button itself, replacing any choice already made.
    const wanted = pickChoice(choices, [fromSheet], "match");
    if (!wanted || !hasMatch(choices, [fromSheet])) return markFailed(run, element, NO_DATASET_OPTION);
    if (wanted.radio.checked) return markSkipped(run, element);
    remember(wanted.radio);
    toggle(wanted.radio);
    return markFilled(run, wanted.radio);
  }
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
  // A date picker would refuse an invalid date before the page's own validation ever saw it.
  const usesPicker = custom === undefined && isDateKind(kind) && isInput(element) && element.type !== "date" && run.settings.dataMode !== "invalid";
  if (usesPicker) return fillTextDate(run, element, kind);

  const sheetDate = custom !== undefined && isInput(element) && element.type === "date" && datasetValue(run, element) !== undefined;
  const value = (sheetDate ? isoDate(custom, run.settings.dateFormat) : custom) ?? generateValue(kind === "skip" ? "text" : kind, run.settings, run.profile, element, repeatIndex(run, element, kind));
  // Only an excluded value, such as the middle name when that setting is off, comes back empty.
  if (value === "") return markSkipped(run, element);
  remember(element);
  if (!writeValue(element, value)) return markRejected(run, element);
  run.written.push(element);
  markFilled(run, element);
}

/** Widgets such as date pickers can discard a value after blur, so success is only known once the page settles. */
function reportClearedFields(run: FillRun): void {
  for (const element of run.written) {
    if (!element.isConnected) continue;
    if (element.value === "") {
      run.result.filled--;
      if (run.settings.dataMode === "valid") run.result.errors++;
      run.result.details.push(`Field cleared the value: ${describe(element)}`);
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
  if (datasetSkips(run, element)) return markSkipped(run, element);
  try {
    if (calendarOnly) await fillFlatpickr(run, element);
    else if (isEditable(element)) fillEditable(run, element);
    else if (isChoice(element)) fillChoiceGroup(run, element);
    else await fillText(run, element as HTMLInputElement | HTMLTextAreaElement);
  } catch {
    markFailed(run, element, "Could not fill");
  }
}

const isDropdown = (element: HTMLElement): boolean => {
  if (isSelect(element)) return true;
  return isCombobox(element) && !(isInput(element) && isDateKind(classifyField(element)));
};

async function fillPasses(run: FillRun): Promise<void> {
  const { detectDynamic, includeFrames, fillScope, requiredOnly } = run.settings;
  for (let pass = 0; pass < (detectDynamic ? MAX_PASSES : 1); pass++) {
    const fields = collectFields(document, { includeFrames, scope: fillScope }).filter((element) => !run.done.has(element));
    run.changed = false;

    adoptPresetLocation(run, fields);
    const wanted = requiredOnly ? fields.filter(isRequired) : fields;
    if (requiredOnly) fields.filter((field) => !wanted.includes(field) && isVisible(field)).forEach((field) => markSkipped(run, field));
    await fillDropdowns(run, wanted.filter(isDropdown));
    for (const element of wanted.filter((field) => !isDropdown(field))) await fillField(run, element);

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

/** Location and names from the sheet shape the generated data, so a ZIP code matches the sheet's city. */
function adoptRow(run: FillRun): void {
  const values = run.row?.profileValues() ?? {};
  if (values.country) adoptCountry(run.profile, values.country, run.settings);
  if (values.state) adoptRegion(run.profile, values.state);
  if (values.city) adoptCity(run.profile, values.city);
  if (values.firstName || values.lastName || values.fullName) adoptNames(run.profile, values, run.settings);
}

export async function fillPage(settings: AutofillSettings, datasetRow?: DatasetRow): Promise<FillResult> {
  const started = Date.now();
  const run: FillRun = {
    settings,
    profile: createProfile(settings),
    result: { filled: 0, skipped: 0, errors: 0, unsupported: 0, details: [] },
    done: new WeakSet(),
    skipped: new Set(),
    written: [],
    filledFields: [],
    skippedDropdowns: 0,
    unselected: new Map(),
    dropdownsFilled: 0,
    changedParents: new Set(),
    kindCounts: new Map(),
    changed: false
  };
  if (datasetRow) {
    run.row = createRowMatcher(datasetRow, settings.datasetBlank, document);
    run.result.datasetRow = { number: datasetRow.number, total: datasetRow.total };
    adoptRow(run);
  }
  startSnapshot();

  const allowSubmissions = blockSubmissions(() => run.result.details.push("Blocked a form submission during the fill."));
  try {
    await fillPasses(run);
  } finally {
    allowSubmissions();
  }

  reportUnselected(run);
  reportClearedFields(run);
  if (settings.validationReport) run.result.details.push(...(await validationReport(run.filledFields, describe)));
  if (run.skippedDropdowns) run.result.details.push(`Skipped ${run.skippedDropdowns} custom dropdowns. Turn on Fill custom dropdowns to include them.`);
  run.result.skipped = run.skipped.size;
  rememberFill(run.filledFields, settings.dataMode, reportIssues(run.result.details), run.result.datasetRow);
  run.result.stats = { byType: countTypes(run.filledFields), ms: Date.now() - started };
  if (settings.detailedReport) addDetailedReport(run);
  if (settings.highlightFilled) highlight(run.filledFields);
  return run.result;
}

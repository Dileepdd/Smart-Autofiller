import { foldAccents } from "../shared/text";
import { MultiSelectMode, SelectionMode } from "../shared/types";

export interface Choice {
  label: string;
  value: string;
}

const MAX_MULTIPLE = 3;
const RANGE = /(\d[\d,]*)\s*(?:-|–|to)\s*(\d[\d,]*)/i;
const OPEN_RANGE = /(\d[\d,]*)\s*\+/;

const PLACEHOLDER = /^(-{2,}|(please\s+)?(select|choose|pick)\b)/i;

/** Case, accents and punctuation are ignored, so "Masculin" matches "masculín" and "Mr." matches "Mr". */
const normalize = (text: string): string => foldAccents(text.toLowerCase()).replace(/[^\p{L}\p{M}\p{N}+]+/gu, "");

export const isPlaceholder = (label: string): boolean => PLACEHOLDER.test(label.trim());

const isOptionDisabled = (option: HTMLOptionElement): boolean =>
  option.disabled || option.hidden || (option.parentElement?.tagName === "OPTGROUP" && (option.parentElement as HTMLOptGroupElement).disabled);

export const usableOptions = (select: HTMLSelectElement): HTMLOptionElement[] =>
  Array.from(select.options).filter((option) =>
    !isOptionDisabled(option) && option.value.trim() !== "" && !isPlaceholder(option.text)
  );

/** A preselected placeholder such as `<option value="0">Select…</option>` does not count. */
export function hasSelection(select: HTMLSelectElement): boolean {
  const option = select.options[select.selectedIndex];
  return Boolean(option) && option.value.trim() !== "" && !option.disabled && !isPlaceholder(option.text);
}

const toNumber = (text: string): number => Number(text.replace(/,/g, ""));

/** True for an option such as "11-50" or "500+" that covers the number. */
function coversNumber(label: string, number: number): boolean {
  const range = RANGE.exec(label);
  if (range) return number >= toNumber(range[1]) && number <= toNumber(range[2]);
  const open = OPEN_RANGE.exec(label);
  return open !== null && number >= toNumber(open[1]);
}

function matchTarget<T extends Choice>(choices: T[], target: string): T | undefined {
  const wanted = normalize(target);
  if (!wanted) return undefined;
  const exact = choices.find(({ label, value }) => normalize(label) === wanted || normalize(value) === wanted);
  if (exact) return exact;
  if (/^\d+$/.test(wanted)) return choices.find(({ label }) => coversNumber(label, Number(wanted)));
  return wanted.length < 3 ? undefined : choices.find(({ label }) => normalize(label).includes(wanted));
}

export const hasMatch = <T extends Choice>(choices: T[], targets: string[]): boolean =>
  targets.some((target) => matchTarget(choices, target) !== undefined);

/** In match mode, prefers a choice matching a target, in target order, before the first valid one. */
export function pickChoice<T extends Choice>(choices: T[], targets: string[], mode: SelectionMode): T | undefined {
  if (mode === "match") {
    for (const target of targets) {
      const match = matchTarget(choices, target);
      if (match) return match;
    }
  }
  return mode === "random" ? choices[Math.floor(Math.random() * choices.length)] : choices[0];
}

export function pickMany<T extends Choice>(choices: T[], mode: MultiSelectMode): T[] {
  if (mode === "multiple") return choices.slice(0, MAX_MULTIPLE);
  const choice = pickChoice(choices, [], mode);
  return choice ? [choice] : [];
}

export const toChoice = (option: HTMLOptionElement): Choice & { option: HTMLOptionElement } =>
  ({ label: option.text.trim(), value: option.value, option });

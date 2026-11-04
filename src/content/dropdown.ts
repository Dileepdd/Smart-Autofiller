import { DropdownMode } from "../shared/types";

export interface Choice {
  label: string;
  value: string;
}

const PLACEHOLDER = /^(-{2,}|(please\s+)?(select|choose|pick)\b)/i;

const normalize = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}+]+/gu, "");

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

function matchTarget<T extends Choice>(choices: T[], target: string): T | undefined {
  const wanted = normalize(target);
  if (!wanted) return undefined;
  const exact = choices.find(({ label, value }) => normalize(label) === wanted || normalize(value) === wanted);
  if (exact || wanted.length < 3) return exact;
  return choices.find(({ label }) => normalize(label).includes(wanted));
}

/** Prefers a choice matching a target, in target order, then falls back to the configured mode. */
export function pickChoice<T extends Choice>(choices: T[], targets: string[], mode: DropdownMode): T | undefined {
  for (const target of targets) {
    const match = matchTarget(choices, target);
    if (match) return match;
  }
  return mode === "random" ? choices[Math.floor(Math.random() * choices.length)] : choices[0];
}

export const toChoice = (option: HTMLOptionElement): Choice & { option: HTMLOptionElement } =>
  ({ label: option.text.trim(), value: option.value, option });

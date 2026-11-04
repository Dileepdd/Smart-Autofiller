import { AutofillSettings, DEFAULT_SETTINGS } from "../src/shared/types";

export const render = (html: string): void => {
  document.body.innerHTML = html;
};

export function find<T extends Element = HTMLInputElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`No element matches ${selector}`);
  return element;
}

export const settingsWith = (overrides: Partial<AutofillSettings> = {}): AutofillSettings => ({
  ...DEFAULT_SETTINGS,
  fillExisting: false,
  ...overrides
});

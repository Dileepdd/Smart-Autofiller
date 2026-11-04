import { AutofillSettings, CustomRule, DEFAULT_SETTINGS } from "./types";

const KEY = "smartAutofillSettings";

export async function getSettings(): Promise<AutofillSettings> {
  const stored = await chrome.storage.local.get(KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[KEY] as Partial<AutofillSettings> | undefined) };
}

export async function saveSettings(settings: AutofillSettings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: settings });
}

/** Returns a message describing the first problem, or undefined when the settings are usable. */
export function validateSettings(settings: AutofillSettings): string | undefined {
  if (settings.ageMin > settings.ageMax || settings.experienceMin > settings.experienceMax) {
    return "Minimum values must not exceed maximum values.";
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(settings.emailDomain)) {
    return "Enter a valid email domain, e.g. sample.com.";
  }
  return undefined;
}

/** Parses one `keyword = value` rule per line, ignoring lines without both parts. */
export function parseCustomRules(text: string): CustomRule[] {
  return text.split("\n").flatMap((line) => {
    const separator = line.indexOf("=");
    if (separator < 0) return [];
    const match = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    return match && value ? [{ match, value }] : [];
  });
}

export const formatCustomRules = (rules: CustomRule[]): string =>
  rules.map(({ match, value }) => `${match} = ${value}`).join("\n");

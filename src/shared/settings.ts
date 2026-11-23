import { templateError } from "./template";
import { AutofillSettings, CustomRule, DEFAULT_SETTINGS, SETTINGS_VERSION } from "./types";

const KEY = "smartAutofillSettings";

/** Accepted values for each setting that has a fixed list. */
const CHOICES: Partial<Record<keyof AutofillSettings, readonly unknown[]>> = {
  gender: ["any", "male", "female"],
  nameRegion: ["US", "IN", "GB", "CA", "AU", "DE", "FR", "ES", "PT", "IT", "NL", "country"],
  usernameMode: ["name", "random"],
  country: ["US", "IN", "GB", "CA", "AU", "DE", "FR", "ES", "PT", "IT", "NL"],
  dataLanguage: ["page", "US", "IN", "GB", "CA", "AU", "DE", "FR", "ES", "PT", "IT", "NL"],
  phoneFormat: ["national", "international"],
  dateFormat: ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"],
  currency: ["auto", "INR", "USD", "GBP", "CAD", "AUD", "EUR"],
  addressFormat: ["standard", "international"],
  textMode: ["realistic", "random"],
  decimalPrecision: [0, 2, 4],
  dataMode: ["valid", "invalid", "minimum", "maximum", "edge"],
  dropdownMode: ["match", "first", "random"],
  radioMode: ["match", "first", "random"],
  multiSelectMode: ["first", "random", "multiple"],
  checkboxMode: ["required", "all", "none"],
  fillScope: ["all", "form"],
  reportFormat: ["text", "markdown", "json"],
  datasetOrder: ["next", "same", "random"],
  datasetAtEnd: ["loop", "stop"],
  datasetBlank: ["generate", "empty"]
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isRule = (value: unknown): value is CustomRule =>
  isRecord(value) && typeof value.match === "string" && typeof value.value === "string";

/**
 * Turns whatever is in storage into complete, valid settings: missing or unusable values take
 * their default, so an older or damaged save can never break a fill.
 */
export function migrateSettings(stored: unknown): AutofillSettings {
  const source = isRecord(stored) ? { ...stored } : {};
  // Before version 2, "first" still preferred options matching the profile, which is now "match".
  if (source.settingsVersion === undefined && source.dropdownMode === "first") source.dropdownMode = "match";

  const settings: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
    const value = source[key];
    const allowed = CHOICES[key as keyof AutofillSettings];
    const usable = typeof value === typeof fallback && !(typeof value === "number" && !Number.isFinite(value));
    if (usable && (!allowed || allowed.includes(value))) settings[key] = value;
  }
  settings.customRules = Array.isArray(source.customRules) ? source.customRules.filter(isRule) : [];
  settings.settingsVersion = SETTINGS_VERSION;
  return settings as unknown as AutofillSettings;
}

export async function getSettings(): Promise<AutofillSettings> {
  const stored = await chrome.storage.local.get(KEY);
  return migrateSettings(stored[KEY]);
}

const EXPORT_APP = "smart-autofill";
const EXPORT_VERSION = 1;

export interface SettingsExport {
  app: typeof EXPORT_APP;
  version: number;
  exportedAt: string;
  settings: AutofillSettings;
  profiles: unknown[];
}

export const exportFile = (settings: AutofillSettings, profiles: unknown[]): SettingsExport =>
  ({ app: EXPORT_APP, version: EXPORT_VERSION, exportedAt: new Date().toISOString(), settings, profiles });

/** Reads an exported file. Unknown or damaged values take their defaults, exactly as a stored setting would. */
export function readExportFile(text: string): { settings: AutofillSettings; profiles: unknown } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "This file is not a Smart Autofill settings file." };
  }
  if (!isRecord(parsed) || parsed.app !== EXPORT_APP || !isRecord(parsed.settings)) return { error: "This file is not a Smart Autofill settings file." };
  if (typeof parsed.version !== "number" || parsed.version > EXPORT_VERSION) return { error: "This file comes from a newer version. Update Smart Autofill first." };
  const settings = migrateSettings(parsed.settings);
  const problem = validateSettings(settings);
  return problem ? { error: problem } : { settings, profiles: parsed.profiles };
}

export async function saveSettings(settings: AutofillSettings): Promise<void> {
  await chrome.storage.local.set({ [KEY]: settings });
}

/** Returns a message describing the first problem, or undefined when the settings are usable. */
export function validateSettings(settings: AutofillSettings): string | undefined {
  if (settings.ageMin > settings.ageMax || settings.experienceMin > settings.experienceMax) {
    return "Minimum values must not exceed maximum values.";
  }
  if (settings.numberMin > settings.numberMax) return "Minimum number must not exceed maximum number.";
  if (settings.companySizeMin > settings.companySizeMax) return "Minimum company size must not exceed the maximum.";
  if (settings.dateStart && settings.dateEnd && settings.dateStart > settings.dateEnd) return "Start date must not be after end date.";
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(settings.emailDomain)) {
    return "Enter a valid email domain, e.g. sample.com.";
  }
  const patterns = [settings.passwordPattern, settings.employeeIdPattern, settings.customerIdPattern, settings.invoiceIdPattern];
  for (const pattern of [...patterns, ...settings.customRules.map(({ value }) => value)]) {
    const problem = templateError(pattern);
    if (problem) return problem;
  }
  return undefined;
}

/** Parses one `keyword = value` rule per line. Use customRuleErrors to report lines this drops. */
export function parseCustomRules(text: string): CustomRule[] {
  return text.split("\n").flatMap((line) => {
    const separator = line.indexOf("=");
    if (separator < 0) return [];
    const match = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    return match && value ? [{ match, value }] : [];
  });
}

/** Describes every line that is not a usable rule, with its line number. */
export function customRuleErrors(text: string): string[] {
  return text.split("\n").flatMap((line, index) => {
    if (!line.trim()) return [];
    const [rule] = parseCustomRules(line);
    const problem = rule ? templateError(rule.value) : "Use the form keyword = value.";
    return problem ? [`Rule on line ${index + 1}: ${problem}`] : [];
  });
}

export const formatCustomRules = (rules: CustomRule[]): string =>
  rules.map(({ match, value }) => `${match} = ${value}`).join("\n");

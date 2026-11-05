import { customRuleErrors, formatCustomRules, migrateSettings, parseCustomRules, validateSettings } from "../shared/settings";
import { AutofillSettings, DEFAULT_SETTINGS } from "../shared/types";

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const isCheckbox = (control: Control): control is HTMLInputElement => control.type === "checkbox";

/** Every control marked data-setting is bound by its id, which is the setting's name. */
const controls = (): Control[] => Array.from(document.querySelectorAll<Control>("[data-setting]"));

export function fillForm(settings: AutofillSettings): void {
  for (const control of controls()) {
    const value = settings[control.id as keyof AutofillSettings];
    if (isCheckbox(control)) control.checked = Boolean(value);
    else control.value = control.id === "customRules" ? formatCustomRules(settings.customRules) : String(value);
  }
}

function readControl(control: Control): unknown {
  if (isCheckbox(control)) return control.checked;
  const value = control.value.trim();
  if (control.id === "customRules") return parseCustomRules(control.value);
  if (control.id === "emailDomain") return value.replace(/^@/, "");
  const fallback = DEFAULT_SETTINGS[control.id as keyof AutofillSettings];
  if (typeof fallback !== "number") return value;
  return value !== "" && Number.isFinite(Number(value)) ? Number(value) : fallback;
}

/** Reads the form, throwing a message for the user if anything is invalid. */
export function readForm(current: AutofillSettings): AutofillSettings {
  const ruleErrors = customRuleErrors((document.getElementById("customRules") as HTMLTextAreaElement).value);
  if (ruleErrors.length) throw new Error(ruleErrors[0]);

  const values = Object.fromEntries(controls().map((control) => [control.id, readControl(control)]));
  const settings = migrateSettings({ ...current, ...values });
  settings.profileSeed = settings.reuseProfile ? current.profileSeed || Date.now() : 0;

  const problem = validateSettings(settings);
  if (problem) throw new Error(problem);
  return settings;
}

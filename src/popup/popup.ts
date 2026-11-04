import { formatCustomRules, getSettings, parseCustomRules, saveSettings, validateSettings } from "../shared/settings";
import { AutofillSettings, DEFAULT_SETTINGS, FillResult } from "../shared/types";

const SAVED_MESSAGE_MS = 1500;

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing popup element: ${id}`);
  return element as T;
};

const status = (message: string, isError = false): void => {
  const node = byId<HTMLParagraphElement>("status");
  node.textContent = message;
  node.classList.toggle("is-error", isError);
};

function showDetails(details: string[]): void {
  const list = byId<HTMLUListElement>("details");
  list.replaceChildren(...details.map((detail) => {
    const item = document.createElement("li");
    item.textContent = detail;
    return item;
  }));
  list.hidden = details.length === 0;
}

function showResult(result?: FillResult): void {
  byId("summary").hidden = !result;
  showDetails(result?.details ?? []);
  if (!result) return;
  byId("countFilled").textContent = String(result.filled);
  byId("countSkipped").textContent = String(result.skipped);
  byId("countErrors").textContent = String(result.errors);
  byId("countUnsupported").textContent = String(result.unsupported);
  const problems = result.errors + result.unsupported;
  if (problems) status(`${problems === 1 ? "1 field needs" : `${problems} fields need`} attention.`, true);
  else status(result.filled ? "Page filled." : "Nothing to fill on this page.");
}

function showProfile(): void {
  const country = byId<HTMLSelectElement>("country");
  const domain = byId<HTMLInputElement>("emailDomain").value.trim().replace(/^@/, "");
  byId("profile").textContent = `${country.selectedOptions[0]?.text ?? ""} data, @${domain}`;
}

async function load(): Promise<void> {
  const settings = await getSettings();
  byId<HTMLInputElement>("emailDomain").value = settings.emailDomain;
  byId<HTMLInputElement>("ageMin").value = String(settings.ageMin);
  byId<HTMLInputElement>("ageMax").value = String(settings.ageMax);
  byId<HTMLInputElement>("experienceMin").value = String(settings.experienceMin);
  byId<HTMLInputElement>("experienceMax").value = String(settings.experienceMax);
  byId<HTMLSelectElement>("domainSuffix").value = settings.domainSuffix;
  byId<HTMLSelectElement>("dropdownMode").value = settings.dropdownMode;
  byId<HTMLInputElement>("fillExisting").checked = settings.fillExisting;
  byId<HTMLSelectElement>("country").value = settings.country;
  byId<HTMLSelectElement>("phoneFormat").value = settings.phoneFormat;
  byId<HTMLSelectElement>("dateFormat").value = settings.dateFormat;
  byId<HTMLTextAreaElement>("customRules").value = formatCustomRules(settings.customRules);
  showProfile();
}

function readSettings(): AutofillSettings {
  const number = (id: keyof AutofillSettings): number => {
    const value = byId<HTMLInputElement>(id).value.trim();
    return value !== "" && Number.isFinite(Number(value)) ? Number(value) : DEFAULT_SETTINGS[id] as number;
  };
  const settings: AutofillSettings = {
    emailDomain: byId<HTMLInputElement>("emailDomain").value.trim().replace(/^@/, ""),
    ageMin: number("ageMin"),
    ageMax: number("ageMax"),
    experienceMin: number("experienceMin"),
    experienceMax: number("experienceMax"),
    domainSuffix: byId<HTMLSelectElement>("domainSuffix").value,
    dropdownMode: byId<HTMLSelectElement>("dropdownMode").value as AutofillSettings["dropdownMode"],
    fillExisting: byId<HTMLInputElement>("fillExisting").checked,
    country: byId<HTMLSelectElement>("country").value as AutofillSettings["country"],
    phoneFormat: byId<HTMLSelectElement>("phoneFormat").value as AutofillSettings["phoneFormat"],
    dateFormat: byId<HTMLSelectElement>("dateFormat").value as AutofillSettings["dateFormat"],
    customRules: parseCustomRules(byId<HTMLTextAreaElement>("customRules").value)
  };
  const problem = validateSettings(settings);
  if (problem) throw new Error(problem);
  return settings;
}

function showView(view: "main" | "settings"): void {
  byId("mainView").hidden = view !== "main";
  byId("settingsView").hidden = view !== "settings";
}

let savedTimer: number | undefined;

async function saveForm(): Promise<void> {
  const error = byId<HTMLParagraphElement>("settingsError");
  const saveState = byId("saveState");
  try {
    await saveSettings(readSettings());
    error.hidden = true;
    showProfile();
    saveState.textContent = "Saved";
    window.clearTimeout(savedTimer);
    savedTimer = window.setTimeout(() => { saveState.textContent = ""; }, SAVED_MESSAGE_MS);
  } catch (problem) {
    error.textContent = problem instanceof Error ? problem.message : "Could not save settings.";
    error.hidden = false;
    saveState.textContent = "";
  }
}

byId("settingsButton").addEventListener("click", () => showView("settings"));
byId("backButton").addEventListener("click", () => showView("main"));
byId("settingsForm").addEventListener("change", () => void saveForm());
byId("settingsForm").addEventListener("submit", (event) => event.preventDefault());

byId<HTMLButtonElement>("fillButton").addEventListener("click", async () => {
  const button = byId<HTMLButtonElement>("fillButton");
  button.disabled = true;
  showResult();
  status("Filling…");
  try {
    const settings = readSettings();
    await saveSettings(settings);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab found.");
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    const response = await chrome.tabs.sendMessage(tab.id, { type: "SMART_AUTOFILL_FILL", settings }) as FillResult | undefined;
    if (!response) throw new Error("The page did not respond. Try reloading it.");
    showResult(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not fill this page.";
    const blocked = /Cannot access|cannot be scripted/i.test(message);
    status(blocked ? "Chrome does not allow extensions on this page." : message, true);
  } finally {
    button.disabled = false;
  }
});

void load().catch(() => status("Could not load saved settings.", true));

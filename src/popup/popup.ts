import { clearMessage, clearTab, FILL_TAB_MESSAGE, fillErrorMessage, FillOutcome, fillReport, undoFill, undoMessage } from "../shared/fill";
import { activeProfile, getEffectiveSettings, getProfileStore, sanitizeProfiles, saveProfileStore } from "../shared/profiles";
import { exportFile, getSettings, readExportFile, saveSettings } from "../shared/settings";
import { DATA_MODES, FillResult } from "../shared/types";
import { recordAction } from "../shared/stats";
import { initOptionsLayout, refreshOptionsLayout } from "./optionsLayout";
import { initDatasets } from "./datasetsForm";
import { initProfiles } from "./profilesForm";
import { fillForm, readForm } from "./settingsForm";

const SAVED_MESSAGE_MS = 1500;

/** The same page doubles as Chrome's options page, which shows only the settings. */
const isOptionsPage = location.pathname.endsWith("/options.html");

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing popup element: ${id}`);
  return element as T;
};

const status = (message: string, isWarning = false): void => {
  const node = byId<HTMLParagraphElement>("status");
  node.textContent = message;
  node.classList.toggle("is-warning", isWarning);
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
  byId("undoButton").hidden = !result?.filled;
  byId("copyButton").hidden = !result?.filled;
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

const COUNTRY_NAMES: Record<string, string> = {
  IN: "India", US: "United States", GB: "United Kingdom", CA: "Canada", AU: "Australia",
  DE: "Germany", FR: "France", ES: "Spain", PT: "Portugal", IT: "Italy", NL: "Netherlands"
};

async function showProfile(): Promise<void> {
  const [settings, store] = await Promise.all([getEffectiveSettings(), getProfileStore()]);
  const mode = settings.dataMode === "valid" ? "" : `. ${DATA_MODES[settings.dataMode].label}`;
  const summary = `${COUNTRY_NAMES[settings.country]} data, @${settings.emailDomain}${mode}`;
  const profile = activeProfile(store);
  byId("profile").textContent = profile ? `${profile.name}: ${summary}` : summary;
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
    await saveSettings(readForm(await getSettings()));
    error.hidden = true;
    await showProfile();
    saveState.textContent = "Saved";
    window.clearTimeout(savedTimer);
    savedTimer = window.setTimeout(() => { saveState.textContent = ""; }, SAVED_MESSAGE_MS);
  } catch (problem) {
    error.textContent = problem instanceof Error ? problem.message : "Could not save settings.";
    error.hidden = false;
    saveState.textContent = "";
  }
}

async function activeTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found.");
  return tab.id;
}

async function fillActiveTab(): Promise<void> {
  const button = byId<HTMLButtonElement>("fillButton");
  button.disabled = true;
  showResult();
  status("Filling…");
  try {
    await saveSettings(readForm(await getSettings()));
    const outcome = await chrome.runtime.sendMessage({ type: FILL_TAB_MESSAGE, tabId: await activeTabId() }) as FillOutcome;
    if ("error" in outcome) status(outcome.error, true);
    else showResult(outcome.result);
  } catch (error) {
    status(fillErrorMessage(error), true);
  } finally {
    button.disabled = false;
  }
}

/** The popup can write to the clipboard itself, because the click on its button allows it. */
async function copyLastFill(): Promise<void> {
  const { reportFormat } = await getSettings();
  const { text, count } = await fillReport(await activeTabId(), reportFormat);
  if (!count) return status("Nothing to copy yet. Fill the form first.", true);
  try {
    await navigator.clipboard.writeText(text);
    void recordAction("copies").catch(() => undefined);
    status(`Copied ${count} fields for a bug report.`);
  } catch {
    status("Could not copy to the clipboard.", true);
  }
}

const shareState = (message: string): void => { byId("shareState").textContent = message; };
const IMPORT_NOTE = "smartAutofillImportNote";

async function exportSettings(): Promise<void> {
  const [settings, store] = await Promise.all([getSettings(), getProfileStore()]);
  const file = new Blob([JSON.stringify(exportFile(settings, store.profiles), null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = `smart-autofill-settings-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  shareState(`Exported settings and ${store.profiles.length} test ${store.profiles.length === 1 ? "profile" : "profiles"}.`);
}

async function importSettings(): Promise<void> {
  const input = byId<HTMLInputElement>("importFile");
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const read = readExportFile(await file.text());
  if ("error" in read) return shareState(read.error);
  const profiles = sanitizeProfiles(read.profiles);
  await saveSettings(read.settings);
  await saveProfileStore({ profiles, activeProfileId: null });
  // Reloading redraws every setting and profile from storage, and the note survives it.
  try { sessionStorage.setItem(IMPORT_NOTE, `Imported settings and ${profiles.length} test ${profiles.length === 1 ? "profile" : "profiles"}.`); } catch { /* the reload still applies the import */ }
  location.reload();
}

async function undoActiveTab(): Promise<void> {
  showResult();
  const result = await undoFill(await activeTabId());
  if (result.restored) void recordAction("undos").catch(() => undefined);
  status(undoMessage(result));
}

async function clearActiveTab(): Promise<void> {
  showResult();
  try {
    const result = await clearTab(await activeTabId(), await getEffectiveSettings());
    status(clearMessage(result));
    if (result.cleared) void recordAction("clears").catch(() => undefined);
    byId("undoButton").hidden = !result.cleared;
  } catch (error) {
    status(fillErrorMessage(error), true);
  }
}

byId("settingsButton").addEventListener("click", () => showView("settings"));
byId("backButton").addEventListener("click", () => showView("main"));
byId("settingsForm").addEventListener("change", (event) => {
  if ((event.target as HTMLElement).matches("[data-setting]")) void saveForm();
});
byId("settingsForm").addEventListener("submit", (event) => event.preventDefault());
byId("fillButton").addEventListener("click", () => void fillActiveTab());
byId("undoButton").addEventListener("click", () => void undoActiveTab());
byId("clearButton").addEventListener("click", () => void clearActiveTab());
byId("copyButton").addEventListener("click", () => void copyLastFill());
byId("exportButton").addEventListener("click", () => void exportSettings());
byId("importButton").addEventListener("click", () => byId<HTMLInputElement>("importFile").click());
byId("importFile").addEventListener("change", () => void importSettings());

if (isOptionsPage) {
  document.body.classList.add("is-options");
  showView("settings");
  initOptionsLayout();
}

async function load(): Promise<void> {
  fillForm(await getSettings());
  refreshOptionsLayout();
  try {
    const note = sessionStorage.getItem(IMPORT_NOTE);
    if (note) {
      sessionStorage.removeItem(IMPORT_NOTE);
      shareState(note);
      showView("settings");
    }
  } catch { /* no note to show */ }
  await initProfiles(() => void showProfile());
  initDatasets();
  await showProfile();
}

void load().catch(() => status("Could not load saved settings.", true));

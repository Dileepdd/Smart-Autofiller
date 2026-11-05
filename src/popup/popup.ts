import { fillErrorMessage, fillTab, undoFill, undoMessage } from "../shared/fill";
import { activeProfile, getEffectiveSettings, getProfileStore } from "../shared/profiles";
import { getSettings, saveSettings } from "../shared/settings";
import { FillResult } from "../shared/types";
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
  byId("undoButton").hidden = !result?.filled;
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

const COUNTRY_NAMES: Record<string, string> = { IN: "India", US: "United States", GB: "United Kingdom", CA: "Canada", AU: "Australia" };

async function showProfile(): Promise<void> {
  const [settings, store] = await Promise.all([getEffectiveSettings(), getProfileStore()]);
  const summary = `${COUNTRY_NAMES[settings.country]} data, @${settings.emailDomain}`;
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
    showResult(await fillTab(await activeTabId(), await getEffectiveSettings()));
  } catch (error) {
    status(fillErrorMessage(error), true);
  } finally {
    button.disabled = false;
  }
}

async function undoActiveTab(): Promise<void> {
  showResult();
  status(undoMessage(await undoFill(await activeTabId())));
}

byId("settingsButton").addEventListener("click", () => showView("settings"));
byId("backButton").addEventListener("click", () => showView("main"));
byId("settingsForm").addEventListener("change", (event) => {
  if ((event.target as HTMLElement).matches("[data-setting]")) void saveForm();
});
byId("settingsForm").addEventListener("submit", (event) => event.preventDefault());
byId("fillButton").addEventListener("click", () => void fillActiveTab());
byId("undoButton").addEventListener("click", () => void undoActiveTab());

if (isOptionsPage) {
  document.body.classList.add("is-options");
  showView("settings");
}

async function load(): Promise<void> {
  fillForm(await getSettings());
  await initProfiles(() => void showProfile());
  await showProfile();
}

void load().catch(() => status("Could not load saved settings.", true));

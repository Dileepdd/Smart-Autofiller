import { fillErrorMessage, fillTab } from "../shared/fill";
import { getSettings, saveSettings } from "../shared/settings";
import { FillResult } from "../shared/types";

const NAME = "Smart Autofill";
const BADGE_OK = "#0b57d0";
const BADGE_PROBLEM = "#b3261e";
const MAX_BADGE_COUNT = 999;

/** Shown when the toolbar icon is right-clicked. Chrome adds its own Options item below these. */
const MENU_ITEMS = [
  { id: "fillOnOpen", title: "Fill on icon click" },
  { id: "fillExisting", title: "Replace existing values" }
] as const;

async function createMenus(): Promise<void> {
  const settings = await getSettings();
  await chrome.contextMenus.removeAll();
  for (const { id, title } of MENU_ITEMS) {
    chrome.contextMenus.create({ id, title, type: "checkbox", checked: settings[id], contexts: ["action"] });
  }
}

let applying: Promise<void> = Promise.resolve();

/**
 * With no popup set, a click reaches onClicked. Chrome forgets this on restart, so it is reapplied.
 * Runs one at a time, because overlapping runs could finish out of order and leave the older setting.
 */
function applySettings(): Promise<void> {
  applying = applying.catch(() => undefined).then(async () => {
    const settings = await getSettings();
    await chrome.action.setPopup({ popup: settings.fillOnOpen ? "" : "popup.html" });
    await Promise.all(MENU_ITEMS.map(({ id }) => chrome.contextMenus.update(id, { checked: settings[id] })));
  });
  return applying;
}

async function showOnIcon(tabId: number, badge: string, title: string, isProblem: boolean): Promise<void> {
  await Promise.all([
    chrome.action.setBadgeBackgroundColor({ tabId, color: isProblem ? BADGE_PROBLEM : BADGE_OK }),
    chrome.action.setBadgeText({ tabId, text: badge }),
    chrome.action.setTitle({ tabId, title })
  ]);
}

function showResult(tabId: number, result: FillResult): Promise<void> {
  const problems = result.errors + result.unsupported;
  const summary = `${NAME}: ${result.filled} filled, ${result.skipped} skipped, ${problems} need attention`;
  const title = [summary, ...result.details].join("\n");
  return showOnIcon(tabId, problems ? "!" : String(Math.min(result.filled, MAX_BADGE_COUNT)), title, problems > 0);
}

chrome.runtime.onInstalled.addListener(() => {
  void createMenus().then(applySettings);
});

chrome.runtime.onStartup.addListener(() => {
  void applySettings();
});

chrome.storage.onChanged.addListener(() => {
  void applySettings();
});

chrome.contextMenus.onClicked.addListener(({ menuItemId, checked }) => {
  void getSettings().then((settings) => saveSettings({ ...settings, [menuItemId]: Boolean(checked) }));
});

chrome.action.onClicked.addListener(async ({ id: tabId }) => {
  if (tabId === undefined) return;
  await showOnIcon(tabId, "…", `${NAME}: filling`, false);
  try {
    await showResult(tabId, await fillTab(tabId, await getSettings()));
  } catch (error) {
    await showOnIcon(tabId, "!", `${NAME}: ${fillErrorMessage(error)}`, true);
  }
});

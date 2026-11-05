import { fillErrorMessage, fillTab, undoFill, undoMessage } from "../shared/fill";
import { getEffectiveSettings, getProfileStore, saveProfileStore, selectProfile } from "../shared/profiles";
import { getSettings, saveSettings } from "../shared/settings";
import { FillResult } from "../shared/types";

const NAME = "Smart Autofill";
const BADGE_OK = "#0b57d0";
const BADGE_PROBLEM = "#b3261e";
const MAX_BADGE_COUNT = 999;
const UNDO_MENU = "undo";
const PROFILE_MENU = "profiles";
const PROFILE_PREFIX = "profile:";
const NO_PROFILE = `${PROFILE_PREFIX}none`;

/** Shown when the toolbar icon is right-clicked. Chrome adds its own Options item below these. */
const SETTING_ITEMS = [
  { id: "fillOnOpen", title: "Fill on icon click" },
  { id: "fillExisting", title: "Replace existing values" }
] as const;

async function createMenus(): Promise<void> {
  const [settings, store] = await Promise.all([getSettings(), getProfileStore()]);
  await chrome.contextMenus.removeAll();
  for (const { id, title } of SETTING_ITEMS) {
    chrome.contextMenus.create({ id, title, type: "checkbox", checked: settings[id], contexts: ["action"] });
  }
  chrome.contextMenus.create({ id: UNDO_MENU, title: "Undo last fill", contexts: ["action"] });
  if (!store.profiles.length) return;
  chrome.contextMenus.create({ id: PROFILE_MENU, title: "Test profile", contexts: ["action"] });
  const items = [{ id: "none", name: "None" }, ...store.profiles];
  for (const { id, name } of items) {
    chrome.contextMenus.create({
      id: `${PROFILE_PREFIX}${id}`,
      parentId: PROFILE_MENU,
      title: name,
      type: "radio",
      checked: (store.activeProfileId ?? "none") === id,
      contexts: ["action"]
    });
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
    await createMenus();
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

async function undo(tabId: number): Promise<void> {
  const message = undoMessage(await undoFill(tabId));
  await showOnIcon(tabId, "", `${NAME}: ${message}`, false);
}

async function handleMenu(menuItemId: string | number, checked: boolean | undefined, tabId?: number): Promise<void> {
  if (menuItemId === UNDO_MENU) {
    if (tabId !== undefined) await undo(tabId);
  } else if (String(menuItemId).startsWith(PROFILE_PREFIX)) {
    const id = menuItemId === NO_PROFILE ? null : String(menuItemId).slice(PROFILE_PREFIX.length);
    await saveProfileStore(selectProfile(await getProfileStore(), id));
  } else {
    await saveSettings({ ...(await getSettings()), [menuItemId]: Boolean(checked) });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void applySettings();
});

chrome.runtime.onStartup.addListener(() => {
  void applySettings();
});

chrome.storage.onChanged.addListener(() => {
  void applySettings();
});

chrome.contextMenus.onClicked.addListener(({ menuItemId, checked }, tab) => {
  void handleMenu(menuItemId, checked, tab?.id);
});

chrome.action.onClicked.addListener(async ({ id: tabId }) => {
  if (tabId === undefined) return;
  await showOnIcon(tabId, "…", `${NAME}: filling`, false);
  try {
    await showResult(tabId, await fillTab(tabId, await getEffectiveSettings()));
  } catch (error) {
    await showOnIcon(tabId, "!", `${NAME}: ${fillErrorMessage(error)}`, true);
  }
});

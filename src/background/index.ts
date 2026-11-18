import { clearMessage, clearTab, copyFill, FILL_TAB_MESSAGE, fillErrorMessage, fillField, FillOutcome, fillTab, undoFill, undoMessage } from "../shared/fill";
import { getEffectiveSettings, getProfileStore, saveProfileStore, selectProfile } from "../shared/profiles";
import { getSettings, saveSettings } from "../shared/settings";
import { DATA_MODES, DataMode, FillResult, ReportFormat } from "../shared/types";
import { libraryFor } from "../shared/valueLibrary";

const NAME = "Smart Autofill";
const BADGE_OK = "#7c2ee6";
const BADGE_TEXT_OK = "#ffffff";
const UNDO_MENU = "undo";
const CLEAR_MENU = "clear";
const DATA_MENU = "dataMode";
const OPTIONS_MENU = "options";
const PROFILE_MENU = "profiles";
const PROFILE_PREFIX = "profile:";
const NO_PROFILE = `${PROFILE_PREFIX}none`;
const MODE_PREFIX = "mode:";
const FIELD_MENU = "field";
const PAGE_MENU = "page";
const COPY_MENU = "copy";
const COPY_PREFIX = "copy:";
const COPY_FORMATS: ReadonlyArray<[ReportFormat, string]> = [["markdown", "As Markdown"], ["text", "As plain text"], ["json", "As JSON"]];
const LIBRARY_PREFIX = "library:";
const VALUE_PREFIX = "value:";

/** Under Filling options, because Chrome shows only six top-level items on a toolbar icon's menu. */
const SETTING_ITEMS = [
  { id: "fillOnOpen", title: "Fill on icon click" },
  { id: "fillExisting", title: "Replace existing values" },
  { id: "requiredOnly", title: "Required fields only" },
  { id: "fillCustomDropdowns", title: "Fill custom dropdowns (slower)" }
] as const;

type Shortcuts = Record<string, string>;

/** Read from Chrome rather than the manifest, because users can change them or a clash can leave one unset. */
async function readShortcuts(): Promise<Shortcuts> {
  const commands = await chrome.commands.getAll();
  return Object.fromEntries(commands.flatMap(({ name, shortcut }) => (name && shortcut ? [[name, shortcut]] : [])));
}

/** Chrome has no shortcut column in extension menus, so it goes in the label. */
const withShortcut = (title: string, shortcut?: string): string => (shortcut ? `${title} (${shortcut})` : title);

/** Shown when a text field is right-clicked. Chrome groups these under the extension's name. */
function createFieldMenus(showSecurityValues: boolean, fillOnOpen: boolean, shortcuts: Shortcuts): void {
  // With Fill on icon click off, this shortcut opens the popup rather than filling.
  const fillShortcut = fillOnOpen ? shortcuts._execute_action : undefined;
  chrome.contextMenus.create({ id: PAGE_MENU, title: withShortcut("Fill entire form", fillShortcut), contexts: ["editable"] });
  chrome.contextMenus.create({ id: FIELD_MENU, title: withShortcut("Fill this field", shortcuts["fill-field"]), contexts: ["editable"] });
  // Anywhere on the page, so the last fill can be copied into a bug report without opening anything.
  chrome.contextMenus.create({ id: COPY_MENU, title: "Copy last fill for a bug report", contexts: ["page", "editable"] });
  for (const [format, title] of COPY_FORMATS) {
    chrome.contextMenus.create({ id: `${COPY_PREFIX}${format}`, parentId: COPY_MENU, title, contexts: ["page", "editable"] });
  }
  for (const { id, title, values } of libraryFor(showSecurityValues)) {
    const parentId = `${LIBRARY_PREFIX}${id}`;
    chrome.contextMenus.create({ id: parentId, title, contexts: ["editable"] });
    values.forEach(({ label }, index) => {
      chrome.contextMenus.create({ id: `${VALUE_PREFIX}${id}:${index}`, parentId, title: label, contexts: ["editable"] });
    });
  }
}

async function createMenus(shortcuts: Shortcuts): Promise<void> {
  const [settings, store] = await Promise.all([getSettings(), getProfileStore()]);
  await chrome.contextMenus.removeAll();
  createFieldMenus(settings.showSecurityValues, settings.fillOnOpen, shortcuts);
  chrome.contextMenus.create({ id: DATA_MENU, title: withShortcut("Test data", shortcuts["next-data-mode"]), contexts: ["action"] });
  for (const [mode, { label }] of Object.entries(DATA_MODES)) {
    chrome.contextMenus.create({
      id: `${MODE_PREFIX}${mode}`,
      parentId: DATA_MENU,
      title: label,
      type: "radio",
      checked: settings.dataMode === mode,
      contexts: ["action"]
    });
  }
  chrome.contextMenus.create({ id: OPTIONS_MENU, title: "Filling options", contexts: ["action"] });
  for (const { id, title } of SETTING_ITEMS) {
    chrome.contextMenus.create({ id, parentId: OPTIONS_MENU, title, type: "checkbox", checked: settings[id], contexts: ["action"] });
  }
  chrome.contextMenus.create({ id: CLEAR_MENU, title: withShortcut("Clear form", shortcuts["clear-form"]), contexts: ["action"] });
  chrome.contextMenus.create({ id: UNDO_MENU, title: withShortcut("Undo last fill", shortcuts["undo-fill"]), contexts: ["action"] });
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

/** Set for every tab, so the mode stays in view. A tab shows this whenever it has no badge of its own. */
async function showDataMode(mode: DataMode, fillOnOpen: boolean, shortcut?: string): Promise<void> {
  const name = mode === "valid" ? NAME : `${NAME} (${DATA_MODES[mode].label})`;
  await Promise.all([
    chrome.action.setBadgeBackgroundColor({ color: BADGE_OK }),
    chrome.action.setBadgeTextColor({ color: BADGE_TEXT_OK }),
    chrome.action.setBadgeText({ text: DATA_MODES[mode].badge }),
    chrome.action.setTitle({ title: withShortcut(`${name} – ${fillOnOpen ? "Click to autofill this form" : "Click to open"}`, shortcut) })
  ]);
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
    const shortcuts = await readShortcuts();
    await showDataMode(settings.dataMode, settings.fillOnOpen, shortcuts._execute_action);
    await createMenus(shortcuts);
  });
  return applying;
}

async function showOnIcon(tabId: number, badge: string, title: string): Promise<void> {
  await Promise.all([
    // Null sends the tab back to the badge set for all tabs. The types wrongly require a string.
    chrome.action.setBadgeText({ tabId, text: badge || null } as unknown as chrome.action.BadgeTextDetails),
    chrome.action.setTitle({ tabId, title })
  ]);
}

function showResult(tabId: number, result: FillResult, mode: DataMode): Promise<void> {
  const problems = result.errors + result.unsupported;
  const label = mode === "valid" ? "" : ` (${DATA_MODES[mode].label})`;
  const summary = `${NAME}: ${result.filled} filled, ${result.skipped} skipped, ${problems} need attention${label}`;
  const title = [summary, ...result.details].join("\n");
  return showOnIcon(tabId, "", title);
}

async function undo(tabId: number): Promise<void> {
  const message = undoMessage(await undoFill(tabId));
  await showOnIcon(tabId, "", `${NAME}: ${message}`);
}

/** Runs a command on a page and leaves the outcome on the icon, as a fill does. */
async function reportOnIcon(tabId: number, command: () => Promise<string>): Promise<void> {
  try {
    await showOnIcon(tabId, "", `${NAME}: ${await command()}`);
  } catch (error) {
    await showOnIcon(tabId, "", `${NAME}: ${fillErrorMessage(error)}`);
  }
}

const clear = (tabId: number): Promise<void> =>
  reportOnIcon(tabId, async () => clearMessage(await clearTab(tabId, await getEffectiveSettings())));

const fillOneField = (tabId: number, frameId: number | undefined, value?: string): Promise<void> =>
  reportOnIcon(tabId, async () => (await fillField(tabId, frameId, await getEffectiveSettings(), value)).message);

function libraryValue(menuItemId: string, showSecurityValues: boolean): string | undefined {
  const [category, index] = menuItemId.slice(VALUE_PREFIX.length).split(":");
  return libraryFor(showSecurityValues).find(({ id }) => id === category)?.values[Number(index)]?.value;
}

async function handleMenu(menuItemId: string | number, checked: boolean | undefined, tabId?: number, frameId?: number): Promise<void> {
  const id = String(menuItemId);
  if (menuItemId === UNDO_MENU) {
    if (tabId !== undefined) await undo(tabId);
  } else if (menuItemId === CLEAR_MENU) {
    if (tabId !== undefined) await clear(tabId);
  } else if (menuItemId === PAGE_MENU) {
    if (tabId !== undefined) await fillAndReport(tabId);
  } else if (menuItemId === FIELD_MENU) {
    if (tabId !== undefined) await fillOneField(tabId, frameId);
  } else if (id.startsWith(COPY_PREFIX)) {
    if (tabId !== undefined) await copyFill(tabId, id.slice(COPY_PREFIX.length) as ReportFormat);
  } else if (id.startsWith(VALUE_PREFIX)) {
    const value = libraryValue(id, (await getSettings()).showSecurityValues);
    if (tabId !== undefined && value !== undefined) await fillOneField(tabId, frameId, value);
  } else if (id.startsWith(MODE_PREFIX)) {
    await saveSettings({ ...(await getSettings()), dataMode: id.slice(MODE_PREFIX.length) as DataMode });
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

chrome.contextMenus.onClicked.addListener(({ menuItemId, checked, frameId }, tab) => {
  void handleMenu(menuItemId, checked, tab?.id, frameId);
});

async function nextDataMode(tabId: number): Promise<void> {
  const settings = await getSettings();
  const modes = Object.keys(DATA_MODES) as DataMode[];
  const dataMode = modes[(modes.indexOf(settings.dataMode) + 1) % modes.length];
  await saveSettings({ ...settings, dataMode });
  await showOnIcon(tabId, "", `${NAME}: ${DATA_MODES[dataMode].label}`);
}

/** The keyboard has no menu to say which frame it came from, so a field is found from the focused element. */
async function handleCommand(command: string, tabId?: number): Promise<void> {
  if (tabId === undefined) return;
  if (command === "fill-field") await fillOneField(tabId, undefined);
  if (command === "clear-form") await clear(tabId);
  if (command === "undo-fill") await undo(tabId);
  if (command === "next-data-mode") await nextDataMode(tabId);
}

chrome.commands.onCommand.addListener((command, tab) => {
  void handleCommand(command, tab?.id);
});

/** Runs a fill and leaves its result on the icon, where it survives the popup closing. */
async function fillAndReport(tabId: number): Promise<FillOutcome> {
  await showOnIcon(tabId, "…", `${NAME}: filling`);
  try {
    const settings = await getEffectiveSettings();
    const result = await fillTab(tabId, settings);
    await showResult(tabId, result, settings.dataMode);
    return { result };
  } catch (error) {
    const message = fillErrorMessage(error);
    await showOnIcon(tabId, "", `${NAME}: ${message}`);
    return { error: message };
  }
}

chrome.action.onClicked.addListener(async ({ id: tabId }) => {
  if (tabId !== undefined) await fillAndReport(tabId);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== FILL_TAB_MESSAGE) return;
  void fillAndReport(message.tabId).then(sendResponse);
  return true;
});

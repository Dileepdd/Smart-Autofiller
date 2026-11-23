import { appendRow, chooseRow, datasetCsv, DatasetRow, getCursor, getDataset, RowRequest, saveCursor, saveDataset } from "../shared/dataset";
import { GENERATORS, SCRIPT_FRAMEWORKS } from "../shared/script";
import { captureTab, clearMessage, clearTab, copyFill, scriptFill, DATASET_FILL_MESSAGE, DATASET_SAVE_MESSAGE, FILL_TAB_MESSAGE, fillErrorMessage, fillField, FillOutcome, fillTab, toastTab, undoFill, undoMessage } from "../shared/fill";
import { getEffectiveSettings, getProfileStore, saveProfileStore, selectProfile } from "../shared/profiles";
import { getSettings, saveSettings } from "../shared/settings";
import { DATA_MODES, DataMode, FillResult, ReportFormat, ScriptFramework } from "../shared/types";
import { recordAction, recordFill } from "../shared/stats";
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
const DATASET_MENU = "dataset";
const DATASET_NEXT = "dataset:next";
const DATASET_SAME = "dataset:same";
const DATASET_SAVE = "dataset:save";
const SCRIPT_MENU = "script";
const SCRIPT_PREFIX = "script:";
const SCRIPT_FILE = "script-file";
const SCRIPT_DATA = "script-data";
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
  { id: "fillCustomDropdowns", title: "Fill custom dropdowns (slower)" },
  { id: "datasetEnabled", title: "Fill from dataset on every click" }
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
  // From the dataset whether or not every click uses it, and a way to grow it from any form.
  chrome.contextMenus.create({ id: DATASET_MENU, title: "Fill from dataset", contexts: ["page", "editable"] });
  chrome.contextMenus.create({ id: DATASET_NEXT, parentId: DATASET_MENU, title: "Next row", contexts: ["page", "editable"] });
  chrome.contextMenus.create({ id: DATASET_SAME, parentId: DATASET_MENU, title: "Same row again", contexts: ["page", "editable"] });
  chrome.contextMenus.create({ id: DATASET_SAVE, parentId: DATASET_MENU, title: "Save this form as a dataset row", contexts: ["page", "editable"] });
  // The last fill as automated test code: steps to paste, or a whole test file to download.
  chrome.contextMenus.create({ id: SCRIPT_MENU, title: "Copy fill as test script", contexts: ["page", "editable"] });
  for (const framework of SCRIPT_FRAMEWORKS) {
    chrome.contextMenus.create({ id: `${SCRIPT_PREFIX}${framework}`, parentId: SCRIPT_MENU, title: GENERATORS[framework].name, contexts: ["page", "editable"] });
  }
  chrome.contextMenus.create({ id: "script-separator", parentId: SCRIPT_MENU, type: "separator", contexts: ["page", "editable"] });
  chrome.contextMenus.create({ id: SCRIPT_FILE, parentId: SCRIPT_MENU, title: "Download full test file", contexts: ["page", "editable"] });
  chrome.contextMenus.create({ id: SCRIPT_DATA, parentId: SCRIPT_MENU, title: "Download data-driven test", contexts: ["page", "editable"] });
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

/** Statistics must never get in the way of the action itself, so a failed write is ignored. */
const quietly = (write: Promise<void>): void => { void write.catch(() => undefined); };

async function undo(tabId: number): Promise<void> {
  const result = await undoFill(tabId);
  if (result.restored) quietly(recordAction("undos"));
  const message = undoMessage(result);
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
  reportOnIcon(tabId, async () => {
    const result = await clearTab(tabId, await getEffectiveSettings());
    if (result.cleared) quietly(recordAction("clears"));
    return clearMessage(result);
  });

const fillOneField = (tabId: number, frameId: number | undefined, value?: string): Promise<void> =>
  reportOnIcon(tabId, async () => {
    const settings = await getEffectiveSettings();
    const result = await fillField(tabId, frameId, settings, value);
    if (result.filled) quietly(recordFill({ byType: { text: 1 }, ms: 0 }, settings.dataMode, 0, false));
    return result.message;
  });

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
  } else if (menuItemId === DATASET_NEXT || menuItemId === DATASET_SAME) {
    if (tabId !== undefined) await fillAndReport(tabId, menuItemId === DATASET_NEXT ? "next" : "same");
  } else if (menuItemId === DATASET_SAVE) {
    if (tabId !== undefined) await saveFormAsRow(tabId);
  } else if (id.startsWith(SCRIPT_PREFIX)) {
    if (tabId !== undefined && (await scriptFill(tabId, id.slice(SCRIPT_PREFIX.length) as ScriptFramework, "copy")).done) quietly(recordAction("scripts"));
  } else if (menuItemId === SCRIPT_FILE || menuItemId === SCRIPT_DATA) {
    if (tabId !== undefined) await downloadScript(tabId, menuItemId === SCRIPT_DATA);
  } else if (id.startsWith(COPY_PREFIX)) {
    if (tabId !== undefined && await copyFill(tabId, id.slice(COPY_PREFIX.length) as ReportFormat)) quietly(recordAction("copies"));
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

/**
 * The row for this fill, when it should use the dataset. A missing dataset or a used-up sheet
 * ends the fill with a note on the page instead of quietly filling generated data.
 */
async function rowFor(tabId: number, request: RowRequest | undefined, enabled: boolean, order: Parameters<typeof chooseRow>[3], atEnd: Parameters<typeof chooseRow>[4]): Promise<DatasetRow | string | undefined> {
  if (!request && !enabled) return undefined;
  const dataset = await getDataset();
  if (!dataset || !dataset.rows.length) return request ? "No dataset yet. Add one in Options, under Datasets." : undefined;
  const chosen = chooseRow(dataset.rows.length, await getCursor(), request ?? "auto", order, atEnd);
  if ("exhausted" in chosen) return `All ${dataset.rows.length} dataset rows are used. Start again from row 1 in Options, under Datasets.`;
  await saveCursor(chosen.cursor);
  return { headers: dataset.headers, values: dataset.rows[chosen.index], number: chosen.index + 1, total: dataset.rows.length };
}

/** Runs a fill and leaves its result on the icon, where it survives the popup closing. */
async function fillAndReport(tabId: number, request?: RowRequest): Promise<FillOutcome> {
  await showOnIcon(tabId, "…", `${NAME}: filling`);
  try {
    const settings = await getEffectiveSettings();
    const row = await rowFor(tabId, request, settings.datasetEnabled, settings.datasetOrder, settings.datasetAtEnd);
    if (typeof row === "string") {
      await toastTab(tabId, row);
      await showOnIcon(tabId, "", `${NAME}: ${row}`);
      return { error: row };
    }
    const result = await fillTab(tabId, settings, row);
    if (result.stats) quietly(recordFill(result.stats, settings.dataMode, result.errors + result.unsupported));
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
  if (message?.type === DATASET_SAVE_MESSAGE) {
    void saveFormAsRow(message.tabId).then(() => sendResponse({ saved: true }));
    return true;
  }
  if (message?.type === DATASET_FILL_MESSAGE) {
    void fillAndReport(message.tabId, message.request === "same" ? "same" : "next").then(sendResponse);
    return true;
  }
  if (message?.type !== FILL_TAB_MESSAGE) return;
  void fillAndReport(message.tabId).then(sendResponse);
  return true;
});

/** Adds the form on the page to the dataset, creating one if there is none yet. */
async function saveFormAsRow(tabId: number): Promise<void> {
  try {
    const captured = await captureTab(tabId);
    if (!captured.length) {
      await toastTab(tabId, "Nothing to save: the form has no filled fields.");
      return;
    }
    const dataset = appendRow(await getDataset(), captured);
    await saveDataset(dataset);
    await toastTab(tabId, `Saved as row ${dataset.rows.length} of the dataset`);
  } catch (error) {
    await showOnIcon(tabId, "", `${NAME}: ${fillErrorMessage(error)}`);
  }
}

/** Downloads the last fill as a full test file in the chosen framework, or as a data-driven test with its CSV. */
async function downloadScript(tabId: number, dataDriven: boolean): Promise<void> {
  const { scriptFramework } = await getSettings();
  const dataset = dataDriven ? await getDataset() : undefined;
  const csv = dataset ? { name: dataset.name, text: datasetCsv(dataset) } : undefined;
  if ((await scriptFill(tabId, scriptFramework, dataDriven ? "data" : "file", csv)).done) quietly(recordAction("scripts"));
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, FillResult } from "../src/shared/types";

type Listener = (...args: any[]) => unknown;

const RESULT: FillResult = { filled: 12, skipped: 3, errors: 0, unsupported: 0, details: [] };

/** A stand-in for the chrome API that keeps listeners so tests can fire them. */
function fakeChrome(stored: object = {}, profiles?: object) {
  const listeners: Record<string, Listener> = {};
  const event = (name: string) => ({ addListener: (listener: Listener) => { listeners[name] = listener; } });
  const api = {
    runtime: { onInstalled: event("installed"), onStartup: event("startup"), onMessage: event("message") },
    commands: { onCommand: event("command"), getAll: vi.fn(async (): Promise<object[]> => []) },
    storage: {
      onChanged: event("changed"),
      local: { get: vi.fn(async () => ({ smartAutofillSettings: stored, smartAutofillProfiles: profiles })), set: vi.fn(async () => undefined) }
    },
    contextMenus: {
      onClicked: event("menu"),
      removeAll: vi.fn(async () => undefined),
      create: vi.fn()
    },
    action: {
      onClicked: event("click"),
      setPopup: vi.fn(async () => undefined),
      setBadgeText: vi.fn(async () => undefined),
      setBadgeBackgroundColor: vi.fn(async () => undefined),
      setBadgeTextColor: vi.fn(async () => undefined),
      setTitle: vi.fn(async () => undefined)
    },
    scripting: { executeScript: vi.fn(async () => []) },
    tabs: { sendMessage: vi.fn(async (): Promise<FillResult | undefined> => RESULT) }
  };
  return { api, listeners };
}

async function start(stored?: object, profiles?: object) {
  const chromeApi = fakeChrome(stored, profiles);
  vi.stubGlobal("chrome", chromeApi.api);
  vi.resetModules();
  await import("../src/background/index");
  return chromeApi;
}

const lastBadge = (api: ReturnType<typeof fakeChrome>["api"]) => api.action.setBadgeText.mock.lastCall;

describe("background worker", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("adds the settings to the toolbar icon's right-click menu", async () => {
    const { api, listeners } = await start();

    await listeners.installed();
    await vi.waitFor(() => expect(api.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "undo", contexts: ["action"] })));

    expect(api.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "fillOnOpen", parentId: "options", type: "checkbox", checked: true, contexts: ["action"] }));
    expect(api.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "fillExisting", parentId: "options", type: "checkbox", checked: true, contexts: ["action"] }));
    expect(api.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "fillCustomDropdowns", type: "checkbox", checked: false }));
    expect(api.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "requiredOnly", type: "checkbox", checked: false }));
    expect(api.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "mode:valid", type: "radio", checked: true }));
  });

  it("stays within Chrome's limit of six top-level items on the icon menu, even with profiles", async () => {
    const { api, listeners } = await start({}, { profiles: [{ id: "a", name: "A", overrides: {}, customRules: [] }], activeProfileId: null });

    await listeners.installed();
    await vi.waitFor(() => expect(api.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "profile:a" })));

    const items = api.contextMenus.create.mock.calls.map(([item]: any[]) => item);
    expect(items.filter((item: any) => item.contexts.includes("action") && !item.parentId).length).toBeLessThanOrEqual(6);
  });

  it("gives every menu a unique id, and labels without characters Chrome treats specially", async () => {
    const { api, listeners } = await start({ showSecurityValues: true });

    listeners.changed();
    await vi.waitFor(() => expect(api.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "undo" })));

    const items = api.contextMenus.create.mock.calls.map(([item]: any[]) => item);
    expect(new Set(items.map((item: any) => item.id)).size).toBe(items.length);
    expect(items.filter((item: any) => /[&%]/.test(item.title))).toEqual([]);
  });

  it("keeps security strings out of the field menu unless they are turned on", async () => {
    const hidden = await start();
    hidden.listeners.changed();
    await vi.waitFor(() => expect(hidden.api.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "library:length" })));
    expect(hidden.api.contextMenus.create).not.toHaveBeenCalledWith(expect.objectContaining({ id: "library:security" }));

    const shown = await start({ showSecurityValues: true });
    shown.listeners.changed();
    await vi.waitFor(() => expect(shown.api.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "library:security", contexts: ["editable"] })));
  });

  it("switches the data mode from the menu", async () => {
    const { api, listeners } = await start();

    listeners.menu({ menuItemId: "mode:invalid" }, { id: 7 });

    await vi.waitFor(() => expect(api.storage.local.set).toHaveBeenCalledWith({ smartAutofillSettings: expect.objectContaining({ dataMode: "invalid" }) }));
  });

  it("shows a data mode on the icon for every tab, and clears it again for valid data", async () => {
    const invalid = await start({ dataMode: "invalid" });
    invalid.listeners.changed();
    await vi.waitFor(() => expect(invalid.api.action.setBadgeText).toHaveBeenCalledWith({ text: "INV" }));
    expect(invalid.api.action.setTitle).toHaveBeenCalledWith({ title: "Smart Autofill (Invalid data) – Click to autofill this form" });

    const valid = await start();
    valid.listeners.changed();
    await vi.waitFor(() => expect(valid.api.action.setBadgeText).toHaveBeenCalledWith({ text: "" }));
  });

  it("names the data mode in the result", async () => {
    const { api, listeners } = await start({ dataMode: "maximum" });

    await listeners.click({ id: 7 });

    expect(api.action.setTitle).toHaveBeenLastCalledWith({ tabId: 7, title: "Smart Autofill: 12 filled, 3 skipped, 0 need attention (Maximum limits)" });
  });

  it("clears the form from the menu and says what happened", async () => {
    const { api, listeners } = await start();
    api.tabs.sendMessage.mockResolvedValue({ cleared: 4, notCleared: 1 } as never);

    listeners.menu({ menuItemId: "clear" }, { id: 7 });

    await vi.waitFor(() => expect(api.action.setTitle).toHaveBeenCalledWith({ tabId: 7, title: "Smart Autofill: Cleared 4 fields. 1 could not be cleared." }));
    expect(api.tabs.sendMessage).toHaveBeenCalledWith(7, expect.objectContaining({ type: "SMART_AUTOFILL_CLEAR" }));
  });

  it("fills one field in the frame the menu was opened in", async () => {
    const { api, listeners } = await start();
    api.tabs.sendMessage.mockResolvedValue({ filled: true, message: "Filled this field." } as never);

    listeners.menu({ menuItemId: "field", frameId: 3 }, { id: 7 });

    await vi.waitFor(() => expect(api.tabs.sendMessage).toHaveBeenCalledWith(7, expect.objectContaining({ type: "SMART_AUTOFILL_FIELD", value: undefined }), { frameId: 3 }));
    expect(api.scripting.executeScript).toHaveBeenCalledWith({ target: { tabId: 7, frameIds: [3] }, files: ["content.js"] });
  });

  it("sends the chosen library value to the field", async () => {
    const { api, listeners } = await start();
    api.tabs.sendMessage.mockResolvedValue({ filled: true, message: "Filled this field." } as never);

    listeners.menu({ menuItemId: "value:numbers:1", frameId: 0 }, { id: 7 });

    await vi.waitFor(() => expect(api.tabs.sendMessage).toHaveBeenCalledWith(7, expect.objectContaining({ value: "-1" }), { frameId: 0 }));
  });

  it("shows each shortcut Chrome reports, in the menus and the tooltip", async () => {
    const { api, listeners } = await start();
    api.commands.getAll.mockResolvedValue([
      { name: "_execute_action", shortcut: "Alt+Shift+F" },
      { name: "fill-field", shortcut: "Ctrl+Shift+1" },
      { name: "undo-fill", shortcut: "" }
    ]);

    listeners.changed();

    await vi.waitFor(() => expect(api.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "undo", title: "Undo last fill" })));
    expect(api.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "page", title: "Fill entire form (Alt+Shift+F)" }));
    expect(api.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "field", title: "Fill this field (Ctrl+Shift+1)" }));
    expect(api.action.setTitle).toHaveBeenCalledWith({ title: "Smart Autofill – Click to autofill this form (Alt+Shift+F)" });
  });

  it("does not offer the icon's shortcut for filling when that shortcut opens the popup", async () => {
    const { api, listeners } = await start({ fillOnOpen: false });
    api.commands.getAll.mockResolvedValue([{ name: "_execute_action", shortcut: "Alt+Shift+F" }]);

    listeners.changed();

    await vi.waitFor(() => expect(api.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "page", title: "Fill entire form" })));
    expect(api.action.setTitle).toHaveBeenCalledWith({ title: "Smart Autofill – Click to open (Alt+Shift+F)" });
  });

  it("fills the whole form from a field's menu", async () => {
    const { api, listeners } = await start();

    listeners.menu({ menuItemId: "page", frameId: 0 }, { id: 7 });

    await vi.waitFor(() => expect(api.tabs.sendMessage).toHaveBeenCalledWith(7, expect.objectContaining({ type: "SMART_AUTOFILL_FILL" })));
  });

  it.each([
    ["fill-field", "SMART_AUTOFILL_FIELD"],
    ["clear-form", "SMART_AUTOFILL_CLEAR"],
    ["undo-fill", "SMART_AUTOFILL_UNDO"]
  ])("runs the %s shortcut on the current tab", async (command, type) => {
    const { api, listeners } = await start();
    api.tabs.sendMessage.mockResolvedValue({ filled: true, message: "Done", cleared: 1, notCleared: 0, restored: 1, notRestored: 0 } as never);

    listeners.command(command, { id: 7 });

    await vi.waitFor(() => expect(api.tabs.sendMessage).toHaveBeenCalledWith(7, expect.objectContaining({ type })));
  });

  it.each([["valid", "invalid"], ["edge", "valid"]])("moves the data mode on from %s to %s", async (dataMode, next) => {
    const { api, listeners } = await start({ dataMode });

    listeners.command("next-data-mode", { id: 7 });

    await vi.waitFor(() => expect(api.storage.local.set).toHaveBeenCalledWith({ smartAutofillSettings: expect.objectContaining({ dataMode: next }) }));
  });

  it("warns on the icon when a field cannot be filled", async () => {
    const { api, listeners } = await start();
    api.tabs.sendMessage.mockResolvedValue({ filled: false, message: "This field cannot be edited." } as never);

    listeners.menu({ menuItemId: "field", frameId: 0 }, { id: 7 });

    await vi.waitFor(() => expect(api.action.setTitle).toHaveBeenCalledWith({ tabId: 7, title: "Smart Autofill: This field cannot be edited." }));
    expect(lastBadge(api)).toEqual([{ tabId: 7, text: "!" }]);
  });

  it("offers saved profiles in the menu, with the active one selected", async () => {
    const { api, listeners } = await start({}, { profiles: [{ id: "a", name: "US Customer", overrides: {}, customRules: [] }], activeProfileId: "a" });

    listeners.changed();

    await vi.waitFor(() => expect(api.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "profile:a", title: "US Customer", type: "radio", checked: true })));
    expect(api.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "profile:none", checked: false }));
  });

  it("switches profile from the menu", async () => {
    const { api, listeners } = await start({}, { profiles: [{ id: "a", name: "A", overrides: {}, customRules: [] }], activeProfileId: null });

    listeners.menu({ menuItemId: "profile:a" }, { id: 7 });

    await vi.waitFor(() => expect(api.storage.local.set).toHaveBeenCalledWith({ smartAutofillProfiles: expect.objectContaining({ activeProfileId: "a" }) }));
  });

  it("fills with the active profile applied", async () => {
    const { api, listeners } = await start({}, { profiles: [{ id: "a", name: "A", overrides: { country: "US" }, customRules: [] }], activeProfileId: "a" });

    await listeners.click({ id: 7 });

    expect(api.tabs.sendMessage).toHaveBeenCalledWith(7, expect.objectContaining({ settings: expect.objectContaining({ country: "US" }) }));
  });

  it("undoes from the menu and says what happened", async () => {
    const { api, listeners } = await start();
    api.tabs.sendMessage.mockResolvedValue({ restored: 4, notRestored: 1 } as never);

    listeners.menu({ menuItemId: "undo" }, { id: 7 });

    await vi.waitFor(() => expect(api.action.setTitle).toHaveBeenCalledWith({ tabId: 7, title: "Smart Autofill: Restored 4 fields. 1 could not be restored." }));
  });

  it("says when there is nothing to undo", async () => {
    const { api, listeners } = await start();
    api.tabs.sendMessage.mockRejectedValue(new Error("Could not establish connection"));

    listeners.menu({ menuItemId: "undo" }, { id: 7 });

    await vi.waitFor(() => expect(api.action.setTitle).toHaveBeenCalledWith({ tabId: 7, title: "Smart Autofill: Nothing to undo on this page." }));
  });

  it("saves a setting changed from the menu without losing the others", async () => {
    const { api, listeners } = await start({ emailDomain: "sample.com" });

    listeners.menu({ menuItemId: "fillExisting", checked: false });

    await vi.waitFor(() => expect(api.storage.local.set).toHaveBeenCalled());
    expect(api.storage.local.set).toHaveBeenCalledWith({
      smartAutofillSettings: { ...DEFAULT_SETTINGS, emailDomain: "sample.com", fillExisting: false }
    });
  });

  it.each([[true, ""], [false, "popup.html"]])("with fill on click %s, sets the popup to %j", async (fillOnOpen, popup) => {
    const { api, listeners } = await start({ fillOnOpen });

    listeners.changed();

    await vi.waitFor(() => expect(api.action.setPopup).toHaveBeenCalledWith({ popup }));
  });

  it("reapplies the popup choice when the browser starts", async () => {
    const { api, listeners } = await start({ fillOnOpen: false });

    listeners.startup();

    await vi.waitFor(() => expect(api.action.setPopup).toHaveBeenCalledWith({ popup: "popup.html" }));
  });

  it("keeps the menu ticks in step with settings changed elsewhere", async () => {
    const { api, listeners } = await start({ fillExisting: false });

    listeners.changed();

    await vi.waitFor(() => expect(api.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "fillExisting", checked: false })));
  });

  it("fills on click and keeps the count in the tooltip, with no badge", async () => {
    const { api, listeners } = await start();

    await listeners.click({ id: 7 });

    expect(api.tabs.sendMessage).toHaveBeenCalledWith(7, expect.objectContaining({ type: "SMART_AUTOFILL_FILL" }));
    expect(lastBadge(api)).toEqual([{ tabId: 7 }]);
    expect(api.action.setTitle).toHaveBeenLastCalledWith({ tabId: 7, title: "Smart Autofill: 12 filled, 3 skipped, 0 need attention" });
  });

  it("runs a fill for the popup and keeps the result on the icon", async () => {
    const { api, listeners } = await start();
    const respond = vi.fn();

    expect(listeners.message({ type: "SMART_AUTOFILL_FILL_TAB", tabId: 7 }, {}, respond)).toBe(true);

    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ result: RESULT }));
    expect(api.action.setTitle).toHaveBeenLastCalledWith({ tabId: 7, title: "Smart Autofill: 12 filled, 3 skipped, 0 need attention" });
  });

  it("tells the popup why a fill failed", async () => {
    const { api, listeners } = await start();
    api.scripting.executeScript.mockRejectedValue(new Error("Cannot access a chrome:// URL"));
    const respond = vi.fn();

    listeners.message({ type: "SMART_AUTOFILL_FILL_TAB", tabId: 7 }, {}, respond);

    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ error: "Chrome does not allow extensions on this page." }));
  });

  it("ignores messages meant for others", async () => {
    const { listeners } = await start();

    expect(listeners.message({ type: "OTHER" }, {}, vi.fn())).toBeUndefined();
  });

  it("marks the icon and lists the fields that need attention", async () => {
    const { api, listeners } = await start();
    api.tabs.sendMessage.mockResolvedValue({ ...RESULT, unsupported: 1, details: ["Unsupported date picker: start date"] });

    await listeners.click({ id: 7 });

    expect(lastBadge(api)).toEqual([{ tabId: 7, text: "!" }]);
    expect(api.action.setBadgeBackgroundColor).toHaveBeenLastCalledWith({ tabId: 7, color: "#f9ab00" });
    expect(api.action.setTitle.mock.lastCall).toEqual([expect.objectContaining({ title: expect.stringContaining("Unsupported date picker: start date") })]);
  });

  it("explains a page Chrome does not allow", async () => {
    const { api, listeners } = await start();
    api.scripting.executeScript.mockRejectedValue(new Error("Cannot access a chrome:// URL"));

    await listeners.click({ id: 7 });

    expect(lastBadge(api)).toEqual([{ tabId: 7, text: "!" }]);
    expect(api.action.setTitle).toHaveBeenLastCalledWith({ tabId: 7, title: "Smart Autofill: Chrome does not allow extensions on this page." });
  });

  it("reports a page that gives no answer", async () => {
    const { api, listeners } = await start();
    api.tabs.sendMessage.mockResolvedValue(undefined);

    await listeners.click({ id: 7 });

    expect(lastBadge(api)).toEqual([{ tabId: 7, text: "!" }]);
  });
});

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

  it("adds both settings to the toolbar icon's right-click menu", async () => {
    const { api, listeners } = await start();

    await listeners.installed();
    await vi.waitFor(() => expect(api.contextMenus.create).toHaveBeenCalledTimes(4));

    expect(api.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "fillOnOpen", type: "checkbox", checked: true, contexts: ["action"] }));
    expect(api.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "fillExisting", type: "checkbox", checked: true, contexts: ["action"] }));
    expect(api.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "fillCustomDropdowns", type: "checkbox", checked: false }));
    expect(api.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "undo", contexts: ["action"] }));
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

  it("fills on click and shows the count on the icon", async () => {
    const { api, listeners } = await start();

    await listeners.click({ id: 7 });

    expect(api.tabs.sendMessage).toHaveBeenCalledWith(7, expect.objectContaining({ type: "SMART_AUTOFILL_FILL" }));
    expect(lastBadge(api)).toEqual([{ tabId: 7, text: "12" }]);
    expect(api.action.setTitle).toHaveBeenLastCalledWith({ tabId: 7, title: "Smart Autofill: 12 filled, 3 skipped, 0 need attention" });
  });

  it("runs a fill for the popup and keeps the result on the icon", async () => {
    const { api, listeners } = await start();
    const respond = vi.fn();

    expect(listeners.message({ type: "SMART_AUTOFILL_FILL_TAB", tabId: 7 }, {}, respond)).toBe(true);

    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ result: RESULT }));
    expect(lastBadge(api)).toEqual([{ tabId: 7, text: "12" }]);
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

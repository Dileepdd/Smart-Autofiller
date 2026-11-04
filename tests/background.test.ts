import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, FillResult } from "../src/shared/types";

type Listener = (...args: any[]) => unknown;

const RESULT: FillResult = { filled: 12, skipped: 3, errors: 0, unsupported: 0, details: [] };

/** A stand-in for the chrome API that keeps listeners so tests can fire them. */
function fakeChrome(stored: object = {}) {
  const listeners: Record<string, Listener> = {};
  const event = (name: string) => ({ addListener: (listener: Listener) => { listeners[name] = listener; } });
  const api = {
    runtime: { onInstalled: event("installed"), onStartup: event("startup") },
    storage: {
      onChanged: event("changed"),
      local: { get: vi.fn(async () => ({ smartAutofillSettings: stored })), set: vi.fn(async () => undefined) }
    },
    contextMenus: {
      onClicked: event("menu"),
      removeAll: vi.fn(async () => undefined),
      create: vi.fn(),
      update: vi.fn(async () => undefined)
    },
    action: {
      onClicked: event("click"),
      setPopup: vi.fn(async () => undefined),
      setBadgeText: vi.fn(async () => undefined),
      setBadgeBackgroundColor: vi.fn(async () => undefined),
      setTitle: vi.fn(async () => undefined)
    },
    scripting: { executeScript: vi.fn(async () => []) },
    tabs: { sendMessage: vi.fn(async (): Promise<FillResult | undefined> => RESULT) }
  };
  return { api, listeners };
}

async function start(stored?: object) {
  const chromeApi = fakeChrome(stored);
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
    await vi.waitFor(() => expect(api.contextMenus.create).toHaveBeenCalledTimes(2));

    expect(api.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "fillOnOpen", type: "checkbox", checked: true, contexts: ["action"] }));
    expect(api.contextMenus.create).toHaveBeenCalledWith(expect.objectContaining({ id: "fillExisting", type: "checkbox", checked: true, contexts: ["action"] }));
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

    await vi.waitFor(() => expect(api.contextMenus.update).toHaveBeenCalledWith("fillExisting", { checked: false }));
  });

  it("fills on click and shows the count on the icon", async () => {
    const { api, listeners } = await start();

    await listeners.click({ id: 7 });

    expect(api.tabs.sendMessage).toHaveBeenCalledWith(7, expect.objectContaining({ type: "SMART_AUTOFILL_FILL" }));
    expect(lastBadge(api)).toEqual([{ tabId: 7, text: "12" }]);
    expect(api.action.setTitle).toHaveBeenLastCalledWith({ tabId: 7, title: "Smart Autofill: 12 filled, 3 skipped, 0 need attention" });
  });

  it("marks the icon and lists the fields that need attention", async () => {
    const { api, listeners } = await start();
    api.tabs.sendMessage.mockResolvedValue({ ...RESULT, unsupported: 1, details: ["Unsupported date picker: start date"] });

    await listeners.click({ id: 7 });

    expect(lastBadge(api)).toEqual([{ tabId: 7, text: "!" }]);
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

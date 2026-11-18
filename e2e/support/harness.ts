import { BrowserContext, CDPSession, chromium, Page, test as base, Worker } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DIST, fixtureUrl } from "./paths";

const POLL_MS = 50;
const POPUP_TIMEOUT_MS = 5000;
const CALL_TIMEOUT_MS = 10_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const freePort = (): Promise<number> => new Promise((resolve) => {
  const server = createServer().listen(0, () => {
    const address = server.address();
    server.close(() => resolve(typeof address === "object" && address ? address.port : 0));
  });
});

export interface PopupResult {
  status: string;
  filled: number;
  skipped: number;
  errors: number;
  unsupported: number;
  details: string[];
}

/** Playwright does not expose extension popups, so this drives one over its DevTools socket. */
export class Popup {
  private nextId = 1;
  private readonly pending = new Map<number, (message: any) => void>();

  private constructor(
    private readonly socket: WebSocket,
    private readonly isOpen: () => Promise<boolean>,
    private readonly readIcon: () => Promise<{ badge: string; title: string }>
  ) {
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(String(data));
      this.pending.get(message.id)?.(message);
      this.pending.delete(message.id);
    };
  }

  static async connect(url: string, isOpen: () => Promise<boolean>, readIcon: () => Promise<{ badge: string; title: string }>): Promise<Popup> {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    const popup = new Popup(socket, isOpen, readIcon);
    await popup.waitFor(`document.readyState === "complete" && document.getElementById("profile").textContent !== ""`);
    return popup;
  }

  private send(method: string, params: object = {}): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`No reply to ${method} ${JSON.stringify(params).slice(0, 120)}`));
      }, CALL_TIMEOUT_MS);
      this.pending.set(id, (message) => { clearTimeout(timer); resolve(message); });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const { result } = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return result?.result?.value;
  }

  async waitFor(expression: string, timeoutMs = POPUP_TIMEOUT_MS): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!(await this.evaluate<boolean>(expression))) {
      if (Date.now() > deadline) throw new Error(`Timed out waiting for: ${expression}`);
      await sleep(POLL_MS);
    }
  }

  /** A real mouse press and release at the element's position, not a scripted click(). */
  async click(selector: string): Promise<void> {
    const { x, y } = await this.evaluate<{ x: number; y: number }>(`(() => {
      const box = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    })()`);
    for (const type of ["mousePressed", "mouseReleased"]) {
      await this.send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
    }
  }

  /** Changes settings through the form, which saves them the way a user's edit would. */
  async configure(values: Record<string, string | boolean>): Promise<void> {
    await this.click("#settingsButton");
    await this.evaluate(`(() => {
      for (const [id, value] of Object.entries(${JSON.stringify(values)})) {
        const field = document.getElementById(id);
        if (typeof value === "boolean") field.checked = value;
        else field.value = value;
        field.dispatchEvent(new Event("change", { bubbles: true }));
      }
    })()`);
    await sleep(100);
    await this.click("#backButton");
  }

  value(id: string): Promise<string> {
    return this.evaluate(`document.getElementById(${JSON.stringify(id)}).value`);
  }

  text(id: string): Promise<string> {
    return this.evaluate(`document.getElementById(${JSON.stringify(id)}).textContent`);
  }

  /**
   * Clicks Fill Entire Page and reads the result the user sees. A widget on the page can take
   * focus, which makes Chrome close the popup, and the user then reads the result from the icon.
   */
  async fill(timeoutMs = 45_000): Promise<PopupResult> {
    await this.click("#fillButton");
    try {
      await this.waitFor(`document.getElementById("status").textContent !== "Filling…" && !document.getElementById("fillButton").disabled`, timeoutMs);
    } catch (error) {
      if (await this.isOpen()) throw error;
      return this.resultFromIcon();
    }
    return this.evaluate<PopupResult>(`(() => {
      const count = (id) => Number(document.getElementById(id).textContent);
      return {
        status: document.getElementById("status").textContent,
        filled: count("countFilled"),
        skipped: count("countSkipped"),
        errors: count("countErrors"),
        unsupported: count("countUnsupported"),
        details: [...document.querySelectorAll("#details li")].map((item) => item.textContent)
      };
    })()`);
  }

  private async resultFromIcon(): Promise<PopupResult> {
    const { title } = await this.readIcon();
    const [summary, ...details] = title.split("\n");
    const [filled, skipped, errors] = (summary.match(/\d+/g) ?? []).map(Number);
    return { status: summary, filled, skipped, errors, unsupported: 0, details };
  }

  /** Waits until Chrome has really closed it, because a click while it is closing would toggle or reuse it. */
  async close(): Promise<void> {
    await this.evaluate("window.close()").catch(() => undefined);
    this.socket.close();
    const deadline = Date.now() + POPUP_TIMEOUT_MS;
    while (await this.isOpen()) {
      if (Date.now() > deadline) throw new Error("The popup did not close.");
      await sleep(POLL_MS);
    }
  }
}

export class Extension {
  constructor(
    readonly context: BrowserContext,
    readonly id: string,
    private readonly browserSession: CDPSession,
    private readonly debuggingPort: number
  ) {}

  /** Runs the toolbar button for this page's tab, which is what grants activeTab, and opens the real popup. */
  async clickToolbarIcon(page: Page): Promise<Popup> {
    await this.triggerAction(page);
    const deadline = Date.now() + POPUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const popup = await this.popupTarget();
      if (popup) return Popup.connect(popup.webSocketDebuggerUrl, () => this.isPopupOpen(), () => this.iconState());
      await sleep(POLL_MS);
    }
    throw new Error("The popup did not open.");
  }

  private async triggerAction(page: Page): Promise<void> {
    await page.bringToFront();
    const { targetInfos } = await this.browserSession.send("Target.getTargets", { filter: [{ type: "tab" }] } as never);
    const tab = targetInfos.find((target) => target.url === page.url());
    if (!tab) throw new Error(`No tab found for ${page.url()}`);
    await this.browserSession.send("Extensions.triggerAction" as never, { id: this.id, targetId: tab.targetId } as never);
  }

  async isPopupOpen(): Promise<boolean> {
    return (await this.popupTarget()) !== undefined;
  }

  private async popupTarget(): Promise<{ url: string; webSocketDebuggerUrl: string } | undefined> {
    const targets = await (await fetch(`http://127.0.0.1:${this.debuggingPort}/json`)).json() as Array<{ url: string; webSocketDebuggerUrl: string }>;
    return targets.find((target) => target.url === `chrome-extension://${this.id}/popup.html`);
  }

  /** The options page Chrome links to from the extension's details and the icon's right-click menu. */
  async openOptions(): Promise<Page> {
    const page = await this.context.newPage();
    await page.goto(`chrome-extension://${this.id}/options.html`);
    return page;
  }

  /** The popup page in an ordinary tab: same code and manifest, but no toolbar click, so no activeTab. */
  async openPopupWithoutToolbar(): Promise<Page> {
    const page = await this.context.newPage();
    await page.goto(`chrome-extension://${this.id}/popup.html`);
    return page;
  }

  /** Most tests set rules in the popup and check that values are kept, so they use the popup mode. */
  async clearSettings(): Promise<void> {
    await this.writeStorage("chrome.storage.local.set({ smartAutofillSettings: { fillOnOpen: false, fillExisting: false, fillCustomDropdowns: true, fillDependentDropdowns: true } })", true);
  }

  /** Saves settings as an older version of the extension would have left them. */
  async useStoredSettings(stored: object): Promise<void> {
    await this.writeStorage(`chrome.storage.local.set({ smartAutofillSettings: ${JSON.stringify(stored)} })`, false);
  }

  /** A first-run user, with nothing saved. */
  async useShippedDefaults(): Promise<void> {
    await this.writeStorage("Promise.resolve()", false);
  }

  /** The background worker applies settings asynchronously, so this waits until the toolbar reflects them. */
  private async writeStorage(expression: string, popupExpected: boolean): Promise<void> {
    const page = await this.openPopupWithoutToolbar();
    await page.evaluate("chrome.storage.local.clear()");
    await page.evaluate(expression);
    await this.waitForPopupMode(page, popupExpected);
    await page.close();
  }

  /** Polls by hand, because waitForFunction treats a returned promise as already true. */
  async waitForPopupMode(page: Page, popupExpected: boolean): Promise<void> {
    const deadline = Date.now() + POPUP_TIMEOUT_MS;
    while ((await page.evaluate("chrome.action.getPopup({})") !== "") !== popupExpected) {
      if (Date.now() > deadline) throw new Error(`The worker never set popup mode to ${popupExpected}.`);
      await sleep(POLL_MS);
    }
  }

  /** Runs the toolbar button where no popup is expected. */
  async clickToolbarIconWithoutPopup(page: Page): Promise<void> {
    await this.triggerAction(page);
  }

  /**
   * The badge and tooltip on the icon for whichever tab has a result. A clean fill leaves no badge,
   * so the tooltip is what marks a result. This asks the worker
   * directly: opening a tab here would push the form into the background, where Chrome throttles timers.
   */
  async iconState(): Promise<{ badge: string; title: string }> {
    const read = `(async () => {
      for (const { id: tabId } of await chrome.tabs.query({})) {
        const title = await chrome.action.getTitle({ tabId });
        if (title.startsWith("Smart Autofill: ") && title !== "Smart Autofill: filling") {
          return { badge: await chrome.action.getBadgeText({ tabId }), title };
        }
      }
      return null;
    })()`;
    const deadline = Date.now() + POPUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const state = await (await this.worker()).evaluate(read) as { badge: string; title: string } | null;
      if (state) return state;
      await sleep(POLL_MS);
    }
    throw new Error("The icon never showed a result.");
  }

  /** Saves settings over the defaults, leaving one-click filling on. */
  async useSettings(settings: object): Promise<void> {
    await this.writeStorage(`chrome.storage.local.set({ smartAutofillSettings: ${JSON.stringify(settings)} })`, false);
  }

  /** The tooltip on a tab that has no result of its own, read from the worker. */
  async allTabsTitle(): Promise<string> {
    return await (await this.worker()).evaluate("chrome.action.getTitle({})") as string;
  }

  /** The badge on a tab that has no result of its own, read from the worker. */
  async allTabsBadge(): Promise<string> {
    return await (await this.worker()).evaluate("chrome.action.getBadgeText({})") as string;
  }

  /**
   * Sends the page what a right-click menu item sends. Real menus cannot be opened from automation,
   * so this needs activeTab from an earlier toolbar action.
   */
  async sendToPage(page: Page, message: object): Promise<any> {
    const expression = `(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return chrome.tabs.sendMessage(tab.id, ${JSON.stringify(message)});
    })()`;
    await page.bringToFront();
    return (await this.worker()).evaluate(expression);
  }

  private async worker(): Promise<Worker> {
    const isOurs = (worker: Worker): boolean => worker.url().startsWith(`chrome-extension://${this.id}/`);
    return this.context.serviceWorkers().find(isOurs) ?? this.context.waitForEvent("serviceworker", isOurs);
  }
}

async function launchExtension(): Promise<{ extension: Extension; profile: string }> {
  const profile = await mkdtemp(join(tmpdir(), "smart-autofill-e2e-"));
  const port = await freePort();
  const context = await chromium.launchPersistentContext(profile, {
    // E2E_CHANNEL=msedge runs the same tests in Microsoft Edge.
    channel: process.env.E2E_CHANNEL ?? "chromium",
    // Popups need a real toolbar. Use xvfb-run on a machine without a display.
    headless: false,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging", `--remote-debugging-port=${port}`]
  });
  const browser = context.browser();
  if (!browser) throw new Error("Browser handle unavailable.");
  const session = await browser.newBrowserCDPSession();
  const { id } = await session.send("Extensions.loadUnpacked" as never, { path: DIST } as never) as { id: string };
  return { extension: new Extension(context, id, session, port), profile };
}

export const test = base.extend<{ open: (name: string) => Promise<Page> }, { extension: Extension }>({
  extension: [async ({}, use) => {
    const { extension, profile } = await launchExtension();
    await use(extension);
    await extension.context.close();
    await rm(profile, { recursive: true, force: true }).catch(() => undefined);
  }, { scope: "worker" }],

  open: async ({ extension }, use) => {
    await extension.clearSettings();
    const pages: Page[] = [];
    await use(async (name) => {
      const page = await extension.context.newPage();
      pages.push(page);
      await page.goto(fixtureUrl(name));
      await page.waitForFunction("typeof window.__state === 'function'");
      return page;
    });
    await Promise.all(pages.map((page) => page.close()));
  }
});

export { expect } from "@playwright/test";

export const pageState = <T = Record<string, any>>(page: Page): Promise<T> => page.evaluate("window.__state()") as Promise<T>;

/** One complete user journey: toolbar icon, optional settings, Fill Entire Page, popup closed. */
export async function fillThroughPopup(extension: Extension, page: Page, settings?: Record<string, string | boolean>): Promise<PopupResult> {
  const popup = await extension.clickToolbarIcon(page);
  if (settings) await popup.configure(settings);
  const result = await popup.fill();
  await popup.close();
  return result;
}

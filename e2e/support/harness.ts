import { BrowserContext, CDPSession, chromium, Page, test as base } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DIST, fixtureUrl } from "./paths";

const POLL_MS = 50;
const POPUP_TIMEOUT_MS = 5000;

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

  private constructor(private readonly socket: WebSocket) {
    socket.onmessage = ({ data }) => {
      const message = JSON.parse(String(data));
      this.pending.get(message.id)?.(message);
      this.pending.delete(message.id);
    };
  }

  static async connect(url: string): Promise<Popup> {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    const popup = new Popup(socket);
    await popup.waitFor(`document.readyState === "complete" && document.getElementById("profile").textContent !== ""`);
    return popup;
  }

  private send(method: string, params: object = {}): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
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

  /** Clicks Fill Entire Page and reads the result the user sees. */
  async fill(timeoutMs = 45_000): Promise<PopupResult> {
    await this.click("#fillButton");
    await this.waitFor(`document.getElementById("status").textContent !== "Filling…" && !document.getElementById("fillButton").disabled`, timeoutMs);
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

  async close(): Promise<void> {
    await this.send("Page.close").catch(() => undefined);
    this.socket.close();
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
    await page.bringToFront();
    const { targetInfos } = await this.browserSession.send("Target.getTargets", { filter: [{ type: "tab" }] } as never);
    const tab = targetInfos.find((target) => target.url === page.url());
    if (!tab) throw new Error(`No tab found for ${page.url()}`);
    await this.browserSession.send("Extensions.triggerAction" as never, { id: this.id, targetId: tab.targetId } as never);

    const deadline = Date.now() + POPUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const targets = await (await fetch(`http://127.0.0.1:${this.debuggingPort}/json`)).json() as Array<{ url: string; webSocketDebuggerUrl: string }>;
      const popup = targets.find((target) => target.url === `chrome-extension://${this.id}/popup.html`);
      if (popup) return Popup.connect(popup.webSocketDebuggerUrl);
      await sleep(POLL_MS);
    }
    throw new Error("The popup did not open.");
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

  /** Most tests set their rules before filling, so they turn off filling on open. */
  async clearSettings(): Promise<void> {
    await this.writeStorage("chrome.storage.local.set({ smartAutofillSettings: { fillOnOpen: false } })");
  }

  /** A first-run user, with nothing saved. */
  async useShippedDefaults(): Promise<void> {
    await this.writeStorage("chrome.storage.local.clear()");
  }

  private async writeStorage(expression: string): Promise<void> {
    const page = await this.openPopupWithoutToolbar();
    await page.evaluate("chrome.storage.local.clear()");
    await page.evaluate(expression);
    await page.close();
  }
}

async function launchExtension(): Promise<{ extension: Extension; profile: string }> {
  const profile = await mkdtemp(join(tmpdir(), "smart-autofill-e2e-"));
  const port = await freePort();
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
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

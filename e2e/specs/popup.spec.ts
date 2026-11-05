import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, fillThroughPopup, pageState, test } from "../support/harness";
import { DIST, FIXTURE_PORT, OTHER_ORIGIN_PORT } from "../support/paths";

test.describe("the real extension", () => {
  test("is tested with the manifest it ships with", async () => {
    const built = JSON.parse(await readFile(join(DIST, "manifest.json"), "utf8"));
    const source = JSON.parse(await readFile(join(DIST, "../public/manifest.json"), "utf8"));
    expect(built).toEqual(source);
    expect(built.permissions).toEqual(["activeTab", "contextMenus", "scripting", "storage"]);
    expect(built.host_permissions).toBeUndefined();
  });

  test("cannot reach a page unless the toolbar icon was clicked", async ({ extension, open }) => {
    const page = await open("simple");
    const extensionPage = await extension.openPopupWithoutToolbar();

    const outcome = await extensionPage.evaluate(async (url) => {
      const chromeApi = (globalThis as any).chrome;
      const [tab] = await chromeApi.tabs.query({ url });
      if (tab) return "tab url is visible without permission";
      const tabs = await chromeApi.tabs.query({});
      const attempts = await Promise.all(tabs.map((candidate: any) =>
        chromeApi.scripting.executeScript({ target: { tabId: candidate.id }, func: () => document.title })
          .then(() => "injected", (error: Error) => error.message)
      ));
      return attempts;
    }, page.url());
    await extensionPage.close();

    expect(outcome).toEqual(expect.arrayContaining([expect.stringContaining("Cannot access")]));
    expect(outcome).not.toContain("injected");
    expect(await pageState(page)).toMatchObject({ email: "" });
  });

  test("toolbar icon, popup, Fill Entire Page, result", async ({ extension, open }) => {
    const page = await open("simple");

    const popup = await extension.clickToolbarIcon(page);
    expect(await popup.text("profile")).toBe("India data, @example.com");
    const result = await popup.fill();
    await popup.close();

    expect(result).toMatchObject({ status: "Page filled.", filled: 3, skipped: 0, errors: 0, unsupported: 0 });
    const state = await pageState(page);
    expect(state.email).toContain("@example.com");
    expect(state.phone).toMatch(/^9\d{4} \d{5}$/);
    expect(state.city).not.toBe("");
  });

  test("activeTab covers only the tab that was clicked", async ({ extension, open }) => {
    const clicked = await open("simple");
    const other = await open("simple");
    await other.goto(`http://localhost:${OTHER_ORIGIN_PORT}/simple.html`);

    await fillThroughPopup(extension, clicked);

    expect((await pageState(clicked)).email).not.toBe("");
    expect((await pageState(other)).email).toBe("");
  });

  test("reports a page Chrome does not allow", async ({ extension, open }) => {
    const page = await open("simple");
    await page.goto("chrome://version");

    const popup = await extension.clickToolbarIcon(page);
    const result = await popup.fill();
    await popup.close();

    expect(result.status).toBe("Chrome does not allow extensions on this page.");
  });

  test("shows fields that could not be filled", async ({ extension, open }) => {
    const page = await open("rejecting");

    const result = await fillThroughPopup(extension, page);

    expect(result).toMatchObject({ status: "2 fields need attention.", filled: 1, errors: 1, unsupported: 1 });
    expect(result.details.join("\n")).toContain("Unsupported date picker");
    expect(result.details.join("\n")).toContain("Field rejected the value");
  });

  test("refuses to fill with invalid settings and says why", async ({ extension, open }) => {
    const page = await open("simple");
    const popup = await extension.clickToolbarIcon(page);

    await popup.click("#settingsButton");
    await popup.evaluate(`(() => {
      const field = document.getElementById("emailDomain");
      field.value = "not a domain";
      field.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
    await popup.waitFor(`!document.getElementById("settingsError").hidden`);
    expect(await popup.text("settingsError")).toBe("Enter a valid email domain, e.g. sample.com.");
    await popup.click("#backButton");

    const result = await popup.fill();
    await popup.close();

    expect(result.status).toBe("Enter a valid email domain, e.g. sample.com.");
    expect((await pageState(page)).email).toBe("");
  });

  test("one click on the icon fills the page with no popup, and shows the count on the icon", async ({ extension, open }) => {
    const page = await open("simple");
    await extension.useShippedDefaults();

    await extension.clickToolbarIconWithoutPopup(page);
    await page.waitForFunction("window.__state().city !== ''");

    expect((await pageState(page)).email).toContain("@example.com");
    const icon = await extension.iconState();
    expect(icon.badge).toBe("3");
    expect(icon.title).toBe("Smart Autofill: 3 filled, 0 skipped, 0 need attention");
    expect(await extension.isPopupOpen()).toBe(false);
  });

  test("clicking again replaces values by default", async ({ extension, open }) => {
    const page = await open("simple");
    await extension.useShippedDefaults();
    await extension.clickToolbarIconWithoutPopup(page);
    await extension.iconState();
    const { email } = await pageState(page);

    await extension.clickToolbarIconWithoutPopup(page);

    await page.waitForFunction((previous) => (window as any).__state().email !== previous, email);
  });

  test("the icon flags fields that could not be filled", async ({ extension, open }) => {
    const page = await open("rejecting");
    await extension.useShippedDefaults();

    await extension.clickToolbarIconWithoutPopup(page);

    const icon = await extension.iconState();
    expect(icon.badge).toBe("!");
    expect(icon.title).toContain("Unsupported date picker");
  });

  test("the icon explains a page Chrome does not allow", async ({ extension, open }) => {
    const page = await open("simple");
    await extension.useShippedDefaults();
    await page.goto("chrome://version");

    await extension.clickToolbarIconWithoutPopup(page);

    const icon = await extension.iconState();
    expect(icon.badge).toBe("!");
    expect(icon.title).toContain("Chrome does not allow extensions on this page.");
  });

  test("turning one-click filling off in the options page brings the popup back", async ({ extension, open }) => {
    const page = await open("simple");
    await extension.useShippedDefaults();
    const options = await extension.openOptions();
    await options.locator("summary", { hasText: "Filling behavior" }).click();
    await options.uncheck("#fillOnOpen");
    await extension.waitForPopupMode(options, true);
    await options.close();

    const popup = await extension.clickToolbarIcon(page);
    await popup.close();

    expect((await pageState(page)).email).toBe("");
  });

  test("with single click off, opening the popup fills nothing", async ({ extension, open }) => {
    const page = await open("simple");

    const popup = await extension.clickToolbarIcon(page);
    await page.waitForTimeout(500);
    expect((await pageState(page)).email).toBe("");

    await popup.fill();
    await popup.close();
    expect((await pageState(page)).email).not.toBe("");
  });

  test("Chrome registers the options page, which fills nothing", async ({ extension, open }) => {
    const page = await open("simple");
    await extension.useShippedDefaults();
    const extensionPage = await extension.openPopupWithoutToolbar();
    const optionsOpened = extension.context.waitForEvent("page", (candidate) => candidate.url().endsWith("/options.html"));

    await extensionPage.evaluate("chrome.runtime.openOptionsPage()");
    const options = await optionsOpened;
    await options.waitForLoadState();
    await extensionPage.close();

    expect(await options.locator("#settingsView").isVisible()).toBe(true);
    expect(await options.locator("#mainView").isVisible()).toBe(false);
    expect(await options.locator("#backButton").isVisible()).toBe(false);
    expect(await options.locator("#fillOnOpen").isChecked()).toBe(true);
    await options.close();
    expect((await pageState(page)).email).toBe("");
  });

  test("a setting changed on the options page reaches the popup", async ({ extension, open }) => {
    const page = await open("simple");
    const options = await extension.openOptions();
    await options.fill("#emailDomain", "options.test");
    await options.locator("#emailDomain").blur();
    await options.locator("#saveState", { hasText: "Saved" }).waitFor();
    await options.close();

    const result = await fillThroughPopup(extension, page);

    expect(result.status).toBe("Page filled.");
    expect((await pageState(page)).email).toContain("@options.test");
  });

  test("starts with the agreed defaults", async ({ extension, open }) => {
    await open("simple");
    await extension.useShippedDefaults();
    const options = await extension.openOptions();
    await options.waitForFunction("document.getElementById('emailDomain').value !== ''");

    expect(await options.inputValue("#country")).toBe("IN");
    expect(await options.inputValue("#dropdownMode")).toBe("match");
    expect(await options.isChecked("#fillExisting")).toBe(true);
    expect(await options.isChecked("#fillOnOpen")).toBe(true);
    expect(await options.inputValue("#checkboxMode")).toBe("required");
    expect(await options.inputValue("#nameRegion")).toBe("IN");
    expect(await options.isChecked("#fillCustomDropdowns")).toBe(false);
    await options.close();
  });

  test("settings persist and apply on a different site", async ({ extension, open }) => {
    const first = await open("simple");
    const popup = await extension.clickToolbarIcon(first);
    await popup.configure({ emailDomain: "sample.com", country: "GB", phoneFormat: "international" });
    await popup.close();

    const second = await open("simple");
    await second.goto(`http://127.0.0.1:${FIXTURE_PORT}/simple.html`);
    const reopened = await extension.clickToolbarIcon(second);
    expect(await reopened.value("emailDomain")).toBe("sample.com");
    expect(await reopened.value("country")).toBe("GB");
    expect(await reopened.text("profile")).toBe("United Kingdom data, @sample.com");
    await reopened.fill();
    await reopened.close();

    const state = await pageState(second);
    expect(state.email).toContain("@sample.com");
    expect(state.phone).toMatch(/^\+44 7700 900\d{3}$/);
  });
});

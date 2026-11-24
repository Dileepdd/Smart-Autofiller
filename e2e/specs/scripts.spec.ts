import { readFileSync } from "node:fs";
import { Page } from "@playwright/test";
import { expect, fillThroughPopup, pageState, test } from "../support/harness";

const CUSTOM = { fillCustomDropdowns: true, fillDependentDropdowns: true, fillExisting: true };

/** Runs generated Playwright steps against a page, exactly as they would run in a real test. */
async function runSteps(page: Page, steps: string): Promise<void> {
  const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor;
  await new AsyncFunction("page", "process", steps)(page, { env: {} });
}

test.describe("test scripts", () => {
  test("generated Playwright steps refill an empty form with the same values", async ({ extension, open }) => {
    const page = await open("settings");
    await fillThroughPopup(extension, page, { fillExisting: true });
    const filled = await pageState(page);

    const { done, text } = await extension.sendToPage(page, { type: "SMART_AUTOFILL_SCRIPT", framework: "playwright", output: "text" });
    expect(done).toBe(true);
    await page.reload();
    await page.waitForFunction("typeof window.__state === 'function'");
    await runSteps(page, text);

    expect(await pageState(page)).toEqual(filled);
  });

  test("steps for custom dropdowns open the list and pick the option, and work again on a fresh page", async ({ extension, open }) => {
    const page = await open("radix");
    await fillThroughPopup(extension, page, { country: "IN", ...CUSTOM });
    const filled = await pageState(page);

    const { text } = await extension.sendToPage(page, { type: "SMART_AUTOFILL_SCRIPT", framework: "playwright", output: "text" });
    expect(text).toContain("getByRole('option'");
    await page.reload();
    await page.waitForFunction("typeof window.__state === 'function'");
    await runSteps(page, text);

    const refilled = await pageState(page);
    for (const key of ["country", "state", "city", "course", "name", "email", "uploadType"]) expect(refilled[key], key).toBe(filled[key]);
  });

  test("each framework's steps come back, and copying from the page says so", async ({ extension, open, context }) => {
    const page = await open("simple");
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });
    await fillThroughPopup(extension, page);

    for (const framework of ["cypress", "seleniumPython", "seleniumJava"]) {
      const { done, text } = await extension.sendToPage(page, { type: "SMART_AUTOFILL_SCRIPT", framework, output: "text" });
      expect(done, framework).toBe(true);
      expect(text, framework).toContain("email");
    }
    await extension.sendToPage(page, { type: "SMART_AUTOFILL_SCRIPT", framework: "playwright", output: "copy" });
    await expect(page.locator("#smart-autofill-toast [role=status]")).toHaveText("Copied Playwright steps for 3 fields");
  });

  test("a full test file downloads with a sensible name", async ({ extension, open }) => {
    const page = await open("simple");
    await fillThroughPopup(extension, page);

    const download = page.waitForEvent("download");
    await extension.sendToPage(page, { type: "SMART_AUTOFILL_SCRIPT", framework: "seleniumPython", output: "file" });
    const file = await download;

    expect(file.suggestedFilename()).toMatch(/^fill-.+\.py$/);
    const text = readFileSync(await file.path(), "utf8");
    expect(text).toContain("def test_fills_the_form():");
    expect(text).toContain(`driver.get(URL)`);
  });

  test("a data-driven test downloads with its CSV, once the fill came from a dataset", async ({ extension, open }) => {
    const options = await extension.openOptions();
    await options.click(".side-nav >> text=Datasets");
    await options.setInputFiles("#datasetFile", { name: "leads.csv", mimeType: "text/csv", buffer: Buffer.from("Email,Phone\na@test.example,9876500001\nb@test.example,9876500002\n") });
    await expect(options.locator("#datasetPosition")).toHaveText("Row 1 of 2");
    await options.close();
    const page = await open("simple");
    await fillThroughPopup(extension, page, { datasetEnabled: true, fillExisting: true });

    const downloads: Array<{ name: string; text: string }> = [];
    page.on("download", async (file) => downloads.push({ name: file.suggestedFilename(), text: readFileSync(await file.path(), "utf8") }));
    await extension.sendToPage(page, { type: "SMART_AUTOFILL_SCRIPT", framework: "playwright", output: "data", csv: { name: "leads.csv", text: "Email,Phone\na@test.example,9876500001\n" } });

    await expect.poll(() => downloads.length).toBe(2);
    const script = downloads.find(({ name }) => name.endsWith(".spec.ts"))!;
    expect(script.text).toContain("readCsv(readFileSync('leads.csv', 'utf8'))");
    expect(script.text).toContain("row['Email']");
    expect(downloads.some(({ name }) => name === "leads.csv")).toBe(true);
    await extension.useSettings({ datasetEnabled: false });
  });
});

test.describe("menus before any fill", () => {
  test("asking for a script on a page not yet filled says to fill it first", async ({ extension, open }) => {
    const page = await open("simple");
    await extension.clickToolbarIcon(page).then((popup) => popup.close());
    const options = await extension.openOptions();
    const args = JSON.stringify({ url: page.url() });
    // The same call the right-click menu makes, from an extension page.
    await options.evaluate(`(async () => {
      const { url } = ${args};
      const [tab] = await chrome.tabs.query({ url });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      await chrome.tabs.sendMessage(tab.id, { type: "SMART_AUTOFILL_SCRIPT", framework: "playwright", output: "copy" });
    })()`);
    await options.close();

    await expect(page.locator("#smart-autofill-toast [role=status]")).toHaveText("Nothing to turn into a script yet. Fill the form first.");
  });
});

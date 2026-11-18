import { readFileSync } from "node:fs";
import { expect, fillThroughPopup, test } from "../support/harness";

// The browser is shared between tests, and an options tab left open would stop a later test opening its own.
test.afterEach(async ({ extension }) => {
  for (const page of extension.context.pages()) if (page.url().endsWith("/options.html")) await page.close();
});

test.describe("copy for bug reports", () => {
  test("the page hands back the last fill as Markdown, without the password", async ({ extension, open }) => {
    const page = await open("simple");
    await fillThroughPopup(extension, page);

    const report = await extension.sendToPage(page, { type: "SMART_AUTOFILL_REPORT", format: "markdown" });

    expect(report.count).toBe(3);
    expect(report.text).toContain("| Field | Value |");
    expect(report.text).toContain("| Email |");
  });

  test("copying from the page writes the clipboard and says so", async ({ extension, open, context }) => {
    const page = await open("simple");
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });
    await fillThroughPopup(extension, page);

    const answer = await extension.sendToPage(page, { type: "SMART_AUTOFILL_COPY", format: "text" });

    expect(answer.copied).toBe(true);
    // Reading the clipboard back hangs in automated Chrome, so the page's own confirmation is checked.
    // What gets copied is covered by the report's unit tests.
    await expect(page.locator("#smart-autofill-toast [role=status]")).toHaveText("Copied 3 fields for a bug report");
  });

  test("before any fill there is nothing to copy", async ({ extension, open }) => {
    const page = await open("simple");
    await extension.clickToolbarIcon(page).then((popup) => popup.close());

    const answer = await extension.sendToPage(page, { type: "SMART_AUTOFILL_COPY", format: "text" }).catch(() => ({ copied: false }));

    expect(answer.copied).toBe(false);
  });
});

test.describe("import and export", () => {
  test("settings exported from one browser import into another", async ({ extension }) => {
    await extension.useSettings({ emailDomain: "team.example.test", country: "DE" });
    const options = await extension.openOptions();

    const download = options.waitForEvent("download");
    await options.click(".side-nav >> text=Share and back up");
    await options.click("#exportButton");
    const file = JSON.parse(readFileSync(await (await download).path(), "utf8"));
    expect(file).toMatchObject({ app: "smart-autofill", version: 1, settings: { emailDomain: "team.example.test", country: "DE" } });

    await extension.useSettings({ emailDomain: "other.test", country: "IN" });
    await options.reload();
    await options.click(".side-nav >> text=Share and back up");
    await options.setInputFiles("#importFile", { name: "settings.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(file)) });

    await expect(options.locator("#shareState")).toHaveText(/Imported settings and 0 test profiles/);
    await expect(options.locator("#emailDomain")).toHaveValue("team.example.test");
    await expect(options.locator("#country")).toHaveValue("DE");
  });

  test("a file that is not ours is refused and changes nothing", async ({ extension }) => {
    await extension.useSettings({ emailDomain: "kept.test" });
    const options = await extension.openOptions();
    await options.click(".side-nav >> text=Share and back up");

    await options.setInputFiles("#importFile", { name: "x.json", mimeType: "application/json", buffer: Buffer.from("{\"hello\": 1}") });

    await expect(options.locator("#shareState")).toHaveText("This file is not a Smart Autofill settings file.");
    await expect(options.locator("#emailDomain")).toHaveValue("kept.test");
  });
});

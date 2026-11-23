import { expect, fillThroughPopup, test } from "../support/harness";

// The browser is shared between tests, and an options tab left open would stop a later test opening its own.
test.afterEach(async ({ extension }) => {
  for (const page of extension.context.pages()) if (page.url().endsWith("/options.html")) await page.close();
});

test.describe("options page", () => {
  test("opens on a dashboard, with a sidebar for every section", async ({ extension }) => {
    const options = await extension.openOptions();

    await expect(options.locator("#dashboard")).toBeVisible();
    await expect(options.locator(".side-nav button")).toHaveText(["Dashboard", "Identity", "Region", "Data generation", "Filling behavior", "Custom rules", "Saved profiles", "Datasets", "Share and back up", "Advanced"]);
    await expect(options.locator("#settingsForm")).toBeHidden();

    await options.click(".side-nav >> text=Region");
    await expect(options.locator("#country")).toBeVisible();
    await expect(options.locator("#emailDomain")).toBeHidden();
    await expect(options.locator(".side-nav button[aria-current=true]")).toHaveText("Region");
  });

  test("the dashboard counts fills, fields and time saved", async ({ extension, open }) => {
    const page = await open("simple");
    await fillThroughPopup(extension, page);
    await fillThroughPopup(extension, page);

    const options = await extension.openOptions();

    const cards = options.locator(".stat-card");
    await expect(cards.nth(0)).toContainText("Forms filled2");
    // Replace existing values is off in tests, so the second fill finds nothing new to fill.
    await expect(cards.nth(1)).toContainText("Fields filled3");
    await expect(cards.nth(2)).toContainText("≈ 15 s");
  });

  test("statistics can be reset, after a second click to confirm", async ({ extension, open }) => {
    const page = await open("simple");
    await fillThroughPopup(extension, page);
    const options = await extension.openOptions();
    await expect(options.locator(".stat-card").first()).toContainText("Forms filled1");

    await options.click("#resetStats");
    await expect(options.locator(".stat-card").first()).toContainText("Forms filled1");
    await options.click("#resetStats");

    await expect(options.locator(".stat-card").first()).toContainText("Forms filled0");
  });
});

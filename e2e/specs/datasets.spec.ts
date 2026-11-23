import { Page } from "@playwright/test";
import { expect, Extension, fillThroughPopup, pageState, test } from "../support/harness";

const CSV = "First Name,Email,Lead Source,Newsletter\nAsha,asha@test.example,Website,yes\nRavi,ravi@test.example,Referral,no\nMeera,meera@test.example,Walk-in,yes\n";

// The browser is shared between tests, and an options tab left open would stop a later test opening its own.
test.afterEach(async ({ extension }) => {
  for (const page of extension.context.pages()) if (page.url().endsWith("/options.html")) await page.close();
});

async function uploadDataset(extension: Extension): Promise<Page> {
  const options = await extension.openOptions();
  await options.click(".side-nav >> text=Datasets");
  await options.setInputFiles("#datasetFile", { name: "leads.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  await expect(options.locator("#datasetPosition")).toHaveText("Row 1 of 3");
  return options;
}

/** What the right-click menu does, sent from the options page. The form's tab needs activeTab from a toolbar click first. */
async function fromMenu(options: Page, page: Page, type: string, request = "next"): Promise<void> {
  const args = JSON.stringify({ url: page.url(), type, request });
  await options.evaluate(`(async () => {
    const { url, type, request } = ${args};
    const [tab] = await chrome.tabs.query({ url });
    await chrome.runtime.sendMessage({ type, tabId: tab.id, request });
  })()`);
}

test.describe("datasets", () => {
  test("an uploaded sheet shows its rows and which field each column fills", async ({ extension }) => {
    const options = await uploadDataset(extension);

    await expect(options.locator("#datasetSummary")).toHaveText("leads.csv · 3 rows · 4 columns");
    await expect(options.locator("#datasetPreview th").nth(1)).toContainText("→ email fields");
    await expect(options.locator("#datasetPreview th").nth(2)).toContainText("→ fields labelled “Lead Source”");
    await expect(options.locator("#datasetPreview tbody tr")).toHaveCount(3);
  });

  test("with the switch on, each fill uses the next row", async ({ extension, open }) => {
    await uploadDataset(extension);
    const page = await open("dataset");

    await fillThroughPopup(extension, page, { datasetEnabled: true, fillExisting: true });
    expect(await pageState(page)).toEqual({ first: "Asha", email: "asha@test.example", source: "Website", news: true });

    await fillThroughPopup(extension, page);
    expect(await pageState(page)).toEqual({ first: "Ravi", email: "ravi@test.example", source: "Referral", news: false });
    await expect(page.locator("#smart-autofill-toast [role=status]")).toContainText("Row 2 of 3");
  });

  test("with the switch off, a fill uses generated data, and the menu still fills from the sheet", async ({ extension, open }) => {
    const options = await uploadDataset(extension);
    const page = await open("dataset");

    await fillThroughPopup(extension, page, { datasetEnabled: false, fillExisting: true });
    expect((await pageState(page)).first).not.toBe("Asha");

    await fromMenu(options, page, "SMART_AUTOFILL_DATASET_FILL", "next");
    await expect.poll(async () => (await pageState(page)).first).toBe("Asha");
    await fromMenu(options, page, "SMART_AUTOFILL_DATASET_FILL", "same");
    await expect(page.locator("#smart-autofill-toast [role=status]")).toContainText("Row 1 of 3");
  });

  test("after the last row it stops and says so, when set to stop", async ({ extension, open }) => {
    const options = await uploadDataset(extension);
    await options.fill("#datasetGoto", "3");
    await options.click("#datasetGotoButton");
    await expect(options.locator("#datasetPosition")).toHaveText("Row 3 of 3");
    const page = await open("dataset");

    await fillThroughPopup(extension, page, { datasetEnabled: true, datasetAtEnd: "stop", fillExisting: true });
    expect((await pageState(page)).first).toBe("Meera");
    await fromMenu(options, page, "SMART_AUTOFILL_DATASET_FILL", "next");

    await expect(page.locator("#smart-autofill-toast [role=status]")).toContainText("All 3 dataset rows are used");
    expect((await pageState(page)).first).toBe("Meera");
  });

  test("a form on the page can be saved as a new row", async ({ extension, open }) => {
    const options = await uploadDataset(extension);
    const page = await open("dataset");
    await extension.clickToolbarIcon(page).then((popup) => popup.close());
    await page.fill("#first", "Kiran");
    await page.fill("#email", "kiran@test.example");
    await page.selectOption("#source", "Website");

    await fromMenu(options, page, "SMART_AUTOFILL_DATASET_SAVE");

    await expect(page.locator("#smart-autofill-toast [role=status]")).toHaveText("Saved as row 4 of the dataset");
    await expect(options.locator("#datasetSummary")).toContainText("4 rows");
  });
});

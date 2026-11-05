import { Page } from "@playwright/test";
import { expect, Extension, fillThroughPopup, pageState, test } from "../support/harness";

/** Opens the real options page, as Chrome's Options menu item does. */
async function withOptions(extension: Extension, edit: (options: Page) => Promise<void>): Promise<void> {
  const options = await extension.openOptions();
  await options.waitForFunction("document.getElementById('emailDomain').value !== ''");
  await options.evaluate("document.querySelectorAll('details').forEach((section) => { section.open = true; })");
  await edit(options);
  await options.close();
}

async function createProfile(options: Page, name: string, values: Record<string, string>): Promise<void> {
  await options.fill("#profileName", name);
  for (const [selector, value] of Object.entries(values)) {
    if (selector === "#profileCountry") await options.selectOption(selector, value);
    else await options.fill(selector, value);
  }
  await options.click("#saveProfile");
  await options.locator("#activeProfile option", { hasText: name }).waitFor({ state: "attached" });
}

test.describe("settings reach the page", () => {
  test("identity settings", async ({ extension, open }) => {
    const page = await open("settings");

    await fillThroughPopup(extension, page, { firstName: "Dileep", lastName: "Kumar", emailDomain: "sample.com", companyName: "Acme Technologies", employeeIdPattern: "E-{number:100-999}" });

    const state = await pageState(page);
    expect(state).toMatchObject({ fullName: "Dileep Kumar", email: "dileep.kumar@sample.com", company: "Acme Technologies" });
    expect(state.employeeId).toMatch(/^E-\d{3}$/);
  });

  test("a custom rule with a number pattern", async ({ extension, open }) => {
    const page = await open("settings");

    await fillThroughPopup(extension, page, { customRules: "grade = L{number:1-9}" });

    expect((await pageState(page)).grade).toMatch(/^L\d$/);
  });

  test("an invalid custom rule is reported, not ignored", async ({ extension }) => {
    await withOptions(extension, async (options) => {
      await options.fill("#customRules", "no separator here");
      await options.locator("#customRules").blur();

      await expect(options.locator("#settingsError")).toHaveText("Rule on line 1: Use the form keyword = value.");
    });
  });

  test("filling behavior: radios, multi-select and checkboxes", async ({ extension, open }) => {
    const page = await open("settings");

    await fillThroughPopup(extension, page, { gender: "female", multiSelectMode: "multiple", checkboxMode: "all" });

    expect(await pageState(page)).toMatchObject({ female: true, skills: 3, news: true });
  });

  test("selected form only", async ({ extension, open }) => {
    const page = await open("settings");
    await page.focus("#otherEmail");

    await fillThroughPopup(extension, page, { fillScope: "form" });

    const state = await pageState(page);
    expect(state.otherEmail).not.toBe("");
    expect(state.email).toBe("");
  });

  test("undo restores the page", async ({ extension, open }) => {
    const page = await open("settings");
    const popup = await extension.clickToolbarIcon(page);
    await popup.fill();
    expect((await pageState(page)).email).not.toBe("");

    await popup.click("#undoButton");
    await popup.waitFor(`document.getElementById("status").textContent.startsWith("Restored")`);
    await popup.close();

    expect((await pageState(page)).email).toBe("");
  });

  test("reusing generated data gives the same person on every fill", async ({ extension, open }) => {
    const page = await open("settings");
    await fillThroughPopup(extension, page, { reuseProfile: true, fillExisting: true });
    const first = await pageState(page);

    await fillThroughPopup(extension, page);

    expect((await pageState(page)).email).toBe(first.email);
  });

  test("detailed report lists fields in the popup without values", async ({ extension, open }) => {
    const page = await open("settings");

    const result = await fillThroughPopup(extension, page, { detailedReport: true });

    expect(result.details.join("\n")).toContain("Filled: email");
    expect(result.details.join("\n")).not.toContain((await pageState(page)).email);
  });

  test("settings saved by an older version keep working", async ({ extension, open }) => {
    const page = await open("settings");
    await extension.useStoredSettings({ emailDomain: "legacy.test", country: "US", dropdownMode: "first", ageMin: 20, ageMax: 40 });

    await extension.clickToolbarIconWithoutPopup(page);
    await page.waitForFunction("window.__state().email !== ''");
    await extension.iconState();

    const state = await pageState(page);
    expect(state.email).toContain("@legacy.test");
    // An old "first" preferred profile matches, so this must not become plain first-valid.
    expect(state.country).toBe("United States");
  });
});

test.describe("saved profiles", () => {
  test("a profile created in the options page applies on one click", async ({ extension, open }) => {
    const page = await open("settings");
    await extension.useShippedDefaults();
    await withOptions(extension, (options) => createProfile(options, "US Customer", {
      "#profileCountry": "US", "#profileEmailDomain": "us.test", "#profileCompany": "Acme Inc", "#profileRules": "grade = L4"
    }));

    await extension.clickToolbarIconWithoutPopup(page);
    await extension.iconState();

    expect(await pageState(page)).toMatchObject({ country: "United States", company: "Acme Inc", grade: "L4" });
    expect((await pageState(page)).email).toContain("@us.test");
  });

  test("switching back to none restores the global settings", async ({ extension, open }) => {
    const page = await open("settings");
    await withOptions(extension, async (options) => {
      await createProfile(options, "Temporary", { "#profileEmailDomain": "profile.test" });
      await options.selectOption("#activeProfile", "");
      await expect(options.locator("#profileName")).toHaveValue("");
    });

    await fillThroughPopup(extension, page);

    expect((await pageState(page)).email).toContain("@example.com");
  });

  test("the popup names the active profile", async ({ extension, open }) => {
    const page = await open("settings");
    await withOptions(extension, (options) => createProfile(options, "Enterprise", { "#profileCountry": "GB" }));

    const popup = await extension.clickToolbarIcon(page);
    expect(await popup.text("profile")).toBe("Enterprise: United Kingdom data, @example.com");
    await popup.close();
  });

  test("a profile can be edited and deleted", async ({ extension }) => {
    await withOptions(extension, async (options) => {
      await createProfile(options, "Draft", { "#profileCompany": "Before" });
      await options.fill("#profileCompany", "After");
      await options.click("#saveProfile");
      await expect(options.locator("#activeProfile option")).toHaveCount(2);

      await options.selectOption("#activeProfile", "");
      await options.selectOption("#activeProfile", { label: "Draft" });
      await expect(options.locator("#profileCompany")).toHaveValue("After");

      await options.click("#deleteProfile");
      await expect(options.locator("#activeProfile option")).toHaveCount(1);
    });
  });

  test("an invalid profile explains itself and is not saved", async ({ extension }) => {
    await withOptions(extension, async (options) => {
      await options.click("#saveProfile");

      await expect(options.locator("#profileError")).toHaveText("Give the profile a name.");
      await expect(options.locator("#activeProfile option")).toHaveCount(1);
    });
  });
});

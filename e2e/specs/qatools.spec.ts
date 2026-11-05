import { expect, pageState, test } from "../support/harness";

test.describe("data modes", () => {
  test("invalid data trips the browser's own validation, without submitting", async ({ extension, open }) => {
    const page = await open("qatools");
    await extension.useSettings({ dataMode: "invalid", checkboxMode: "required" });

    await extension.clickToolbarIconWithoutPopup(page);
    const icon = await extension.iconState();

    const state = await pageState(page);
    expect(state.email).toBe("user@@example");
    expect(state.age).toBe("66");
    expect(state.start).toBe("2025-01-01");
    expect(state.invalid).toEqual(expect.arrayContaining(["email", "age", "start"]));
    expect(state.plan).toBe("Basic");
    expect(state.locked).toBe("kept");
    expect(state.submitted).toBe(0);
    expect(icon.title).toContain("(Invalid data)");
    expect(icon.title).toContain("Check validation");
  });

  test("the mode stays on the icon after a clean fill, and goes when valid data returns", async ({ extension, open }) => {
    const page = await open("qatools");
    await extension.useSettings({ dataMode: "maximum" });

    await extension.clickToolbarIconWithoutPopup(page);
    const icon = await extension.iconState();

    expect(icon.badge).toBe("MAX");
    await expect.poll(() => extension.allTabsBadge()).toBe("MAX");

    await extension.useShippedDefaults();
    await expect.poll(() => extension.allTabsBadge()).toBe("");
  });

  test("maximum and minimum fill to the declared limits", async ({ extension, open }) => {
    const page = await open("qatools");

    await extension.useSettings({ dataMode: "maximum" });
    await extension.clickToolbarIconWithoutPopup(page);
    await extension.iconState();
    let state = await pageState(page);
    expect(state.company).toHaveLength(12);
    expect(state.age).toBe("65");
    expect(state.start).toBe("2024-12-31");

    await page.reload();
    await page.waitForFunction("typeof window.__state === 'function'");
    await extension.useSettings({ dataMode: "minimum" });
    await extension.clickToolbarIconWithoutPopup(page);
    await extension.iconState();
    state = await pageState(page);
    expect(state.company).toHaveLength(3);
    expect(state.age).toBe("18");
    expect(state.start).toBe("2024-01-01");
  });
});

test.describe("shortcuts", () => {
  test("the tooltip names the shortcut Chrome actually registered", async ({ extension, open }) => {
    await open("qatools");
    await extension.useShippedDefaults();

    await expect.poll(() => extension.allTabsTitle()).toBe("Smart Autofill – Click to autofill this form (Alt+Shift+F)");
  });
});

test.describe("required fields only", () => {
  test("leaves optional fields empty", async ({ extension, open }) => {
    const page = await open("qatools");
    await extension.useSettings({ requiredOnly: true });

    await extension.clickToolbarIconWithoutPopup(page);
    await extension.iconState();

    const state = await pageState(page);
    expect(state.email).toContain("@");
    expect(state.terms).toBe(true);
    expect(state.company).toBe("");
    expect(state.age).toBe("");
    expect(state.plan).toBe("");
  });
});

test.describe("clear form", () => {
  test("the popup button empties the form, and Undo brings it back", async ({ extension, open }) => {
    const page = await open("qatools");
    const popup = await extension.clickToolbarIcon(page);
    await popup.fill();
    const before = await pageState(page);
    expect(before.email).not.toBe("");

    await popup.click("#clearButton");
    await popup.waitFor(`document.getElementById("status").textContent.startsWith("Cleared")`);

    const cleared = await pageState(page);
    expect(cleared.email).toBe("");
    expect(cleared.plan).toBe("");
    expect(cleared.terms).toBe(false);
    expect(cleared.locked).toBe("kept");
    expect(cleared.submitted).toBe(0);

    await popup.click("#undoButton");
    await popup.waitFor(`document.getElementById("status").textContent.startsWith("Restored")`);
    await popup.close();

    expect((await pageState(page)).email).toBe(before.email);
  });
});

test.describe("fill one field", () => {
  test("fills the focused field and nothing else", async ({ extension, open }) => {
    const page = await open("qatools");
    await extension.useShippedDefaults();
    await extension.clickToolbarIconWithoutPopup(page);
    await extension.iconState();
    const before = await pageState(page);
    await page.focus("#company");

    const result = await extension.sendToPage(page, { type: "SMART_AUTOFILL_FIELD", value: "<>&\"'" });

    expect(result).toEqual({ filled: true, message: "Filled this field." });
    const after = await pageState(page);
    expect(after.company).toBe("<>&\"'");
    expect(after.email).toBe(before.email);
  });

  test("right-click values never reach a read-only field", async ({ extension, open }) => {
    const page = await open("qatools");
    await extension.useShippedDefaults();
    await extension.clickToolbarIconWithoutPopup(page);
    await extension.iconState();
    await page.focus("#locked");

    const result = await extension.sendToPage(page, { type: "SMART_AUTOFILL_FIELD", value: "changed" });

    expect(result.filled).toBe(false);
    expect((await pageState(page)).locked).toBe("kept");
  });
});

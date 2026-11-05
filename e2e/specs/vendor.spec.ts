import { expect, fillThroughPopup, pageState, test } from "../support/harness";

/** Modelled on a real vendor form: a preset country, server-loaded lists and a tax ID format hint. */
test.describe("hand-built dropdown with a search box and no ARIA options", () => {
  test("selects an option and carries on", async ({ extension, open }) => {
    const page = await open("plaindrop");

    const result = await fillThroughPopup(extension, page);

    const state = await pageState(page);
    expect(state.state).toBe("Alabama");
    expect(state.email).not.toBe("");
    expect(state.panels).toBe(0);
    expect(result.filled).toBeGreaterThanOrEqual(2);
  });
});

test.describe("default fast fill", () => {
  test("one click fills fields at once, keeps custom dropdowns closed and follows the page's country", async ({ extension, open }) => {
    const page = await open("vendor");
    await extension.useShippedDefaults();
    const started = Date.now();

    await extension.clickToolbarIconWithoutPopup(page);
    await extension.iconState();

    expect(Date.now() - started).toBeLessThan(2500);
    const state = await pageState(page);
    expect(state.country).toBe("United States");
    expect(state.state).toBeNull();
    expect(state.taxValid).toBe(true);
    expect(state.zip).toMatch(/^\d{5}$/);
  });
});

test.describe("vendor form with server-loaded dropdowns", () => {
  for (const [name, query] of [["plain", ""], ["searchable", "?searchable"]]) {
    for (const fillExisting of [true, false]) {
      test(`${name} selects, replace ${fillExisting ? "on" : "off"}`, async ({ extension, open }) => {
        const page = await open("vendor");
        await page.goto(page.url() + query);
        await page.waitForFunction("typeof window.__state === 'function'");

        const result = await fillThroughPopup(extension, page, { country: "IN", fillExisting });

        const state = await pageState(page);
        expect(result).toMatchObject({ errors: 0, unsupported: 0 });
        expect(state.country).toBe("United States");
        expect(["California", "Texas"]).toContain(state.state);
        expect(state.city).toBeTruthy();
        expect(state.taxValid).toBe(true);
        expect(state.zip).toMatch(/^\d{5}$/);
      });
    }
  }
});

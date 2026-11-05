import { expect, fillThroughPopup, pageState, test } from "../support/harness";

/** Modelled on a real vendor form: a preset country, server-loaded lists and a tax ID format hint. */
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

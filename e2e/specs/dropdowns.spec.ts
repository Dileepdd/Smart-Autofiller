import { expect, fillThroughPopup, pageState, test } from "../support/harness";

const CUSTOM = { fillCustomDropdowns: true, fillDependentDropdowns: true, fillExisting: true };

test.describe("Radix and cmdk form with dependent lists", () => {
  test("fills lists, dependent lists, selects, text and radios in one go", async ({ extension, open }) => {
    const page = await open("radix");

    const result = await fillThroughPopup(extension, page, { country: "IN", ...CUSTOM });

    const state = await pageState(page);
    expect(state.country).toBe("United States");
    expect(state.state).toBe("Alabama");
    expect(state.city).toBe("Mobile");
    expect(state.course).toBe("BBA");
    expect(state.gender).not.toBe("");
    expect(state.leadSource).not.toBe("");
    expect(state.name).not.toBe("");
    expect(state.email).toContain("@");
    expect(state.uploadType).not.toBe("");
    expect(state.phone).toMatch(/^[+][0-9]{8,}$/);
    expect(result.errors).toBe(0);
  });

  test("leaves no list open and the page visible", async ({ extension, open }) => {
    const page = await open("radix");

    await fillThroughPopup(extension, page, { country: "IN", ...CUSTOM });

    const state = await pageState(page);
    expect(state.lists).toBe(0);
    expect(state.pageHidden).toBe(false);
  });

  test("a value the form already had drives the location data", async ({ extension, open }) => {
    const page = await open("radix");

    await fillThroughPopup(extension, page, { country: "IN", ...CUSTOM });

    expect((await pageState(page)).zip).toMatch(/^\d{5}$/);
  });

  test("a drawer of records is closed unused, and the rest of the form still fills", async ({ extension, open }) => {
    const page = await open("radix");
    await page.goto(`${page.url()}?drawer`);
    await page.waitForFunction("typeof window.__state === 'function'");

    const result = await fillThroughPopup(extension, page, { country: "IN", ...CUSTOM });

    const state = await pageState(page);
    expect(state.drawer).toBe(false);
    expect(state.applied).toBe(false);
    expect(state.pageHidden).toBe(false);
    expect(state.name).not.toBe("");
    expect(result.errors).toBe(1);
    expect(result.details.join("\n")).toContain("Could not select an option");
  });

  test("fills fields scrolled out of view above the screen", async ({ extension, open }) => {
    const page = await open("radix");
    await page.evaluate(() => { const scroller = document.querySelector("#scroller")!; scroller.scrollTop = scroller.scrollHeight; });

    await fillThroughPopup(extension, page, { country: "IN", ...CUSTOM });

    const state = await pageState(page);
    expect(state.name).not.toBe("");
    expect(state.email).toContain("@");
    expect(state.uploadType).not.toBe("");
  });

  test("moves on quickly from lists with no records, and fills what comes after them", async ({ extension, open }) => {
    const page = await open("radix");
    await page.goto(`${page.url()}?empty`);
    await page.waitForFunction("typeof window.__state === 'function'");
    const started = Date.now();

    const result = await fillThroughPopup(extension, page, { country: "IN", ...CUSTOM });

    const state = await pageState(page);
    expect(state.tail).toBe("Last");
    expect(state.name).not.toBe("");
    expect(state.lists).toBe(0);
    expect(result.errors).toBe(4);
    // Waiting out the full loading time on each would take well over 20 seconds.
    expect(Date.now() - started).toBeLessThan(20000);
  });

  test("never submits the form", async ({ extension, open }) => {
    const page = await open("radix");

    await fillThroughPopup(extension, page, { country: "IN", ...CUSTOM });

    expect(await page.evaluate("window.__submitted === true")).toBe(false);
  });
});

test.describe("location popups with a search box and plain button rows", () => {
  const openGeo = async (open: (name: string) => Promise<import("@playwright/test").Page>) => {
    const page = await open("radix");
    await page.goto(`${page.url().split("?")[0]}?geo`);
    await page.waitForFunction("typeof window.__state === 'function'");
    return page;
  };

  test("fills them quickly and keeps the country already chosen", async ({ extension, open }) => {
    const page = await openGeo(open);
    const started = Date.now();

    const result = await fillThroughPopup(extension, page, { country: "IN", ...CUSTOM });

    const state = await pageState(page);
    expect(state).toMatchObject({ country: "United States", state: "Alabama", city: "Mobile", open: 0 });
    expect(state.name).not.toBe("");
    expect(state.zip).toMatch(/^[0-9]{5}$/);
    expect(result.errors).toBe(0);
    expect(Date.now() - started).toBeLessThan(6000);
  });

  test("with dependent dropdowns off, stops at the first level", async ({ extension, open }) => {
    const page = await openGeo(open);

    const result = await fillThroughPopup(extension, page, { country: "IN", ...CUSTOM, fillDependentDropdowns: false });

    expect(await pageState(page)).toMatchObject({ state: "Alabama", city: "" });
    expect(result.errors).toBe(0);
    expect(await page.evaluate("window.__submitted === true")).toBe(false);
  });
});

test.describe("Element UI form with dependent selects", () => {
  for (const [name, query] of [["on the page body", ""], ["inside the form", "?inline"]]) {
    test(`changes the country and fills what depends on it, with lists ${name}`, async ({ extension, open }) => {
      const page = await open("elementui");
      await page.goto(page.url().split("?")[0] + query);
      await page.waitForFunction("typeof window.__state === 'function'");

      // A fixed data language replaces the country the page shows, which is what this test needs.
      const result = await fillThroughPopup(extension, page, { country: "IN", dataLanguage: "IN", ...CUSTOM });

      const state = await pageState(page);
      expect(state).toMatchObject({ country: "India", state: "Goa", city: "Panaji", status: "Active", readOnly: "Locked" });
      expect(state.name).not.toBe("");
      expect(state.zip).toMatch(/^[0-9]{6}$/);
      expect(result.errors).toBe(0);
      expect(await page.locator("#street input").inputValue()).not.toMatch(/^(Apt|Suite)/);
    });
  }

  test("following the page keeps the country it already shows", async ({ extension, open }) => {
    const page = await open("elementui");

    await fillThroughPopup(extension, page, { country: "IN", ...CUSTOM });

    const state = await pageState(page);
    expect(state).toMatchObject({ country: "United States", state: "Alabama", city: "Mobile" });
    expect(state.zip).toMatch(/^[0-9]{5}$/);
  });
});

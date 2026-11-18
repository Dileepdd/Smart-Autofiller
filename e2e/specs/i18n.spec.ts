import { de, es } from "@faker-js/faker";
import { expect, fillThroughPopup, pageState, test } from "../support/harness";

const firstNames = (locale: typeof de): Set<string> => new Set(Object.values(locale.person!.first_name!).flat());
const GERMAN_CITIES = ["Berlin", "München", "Nürnberg", "Hamburg", "Köln", "Düsseldorf", "Frankfurt am Main"];

test.describe("forms in other languages", () => {
  test("a German page gets German names and a German address", async ({ extension, open }) => {
    const page = await open("german");

    const result = await fillThroughPopup(extension, page, { country: "IN" });

    const state = await pageState(page);
    expect(firstNames(de).has(state.vorname)).toBe(true);
    expect(state.nachname).not.toBe("");
    expect(state.email).toMatch(/^[a-z0-9.]+@/);
    expect(state.telefon).toMatch(/^0151/);
    expect(state.plz).toMatch(/^\d{5}$/);
    expect(GERMAN_CITIES).toContain(state.ort);
    expect(state.strasse).not.toBe("");
    expect(result.errors).toBe(0);
  });

  test("a chosen data language wins over the page's own", async ({ extension, open }) => {
    const page = await open("german");

    await fillThroughPopup(extension, page, { country: "IN", dataLanguage: "ES" });

    const state = await pageState(page);
    expect(firstNames(es).has(state.vorname)).toBe(true);
    expect(state.telefon).toMatch(/^6/);
  });

  test("an English page keeps the Country setting", async ({ extension, open }) => {
    const page = await open("simple");

    await fillThroughPopup(extension, page, { country: "IN" });

    expect((await pageState(page)).phone).toMatch(/^9/);
  });
});

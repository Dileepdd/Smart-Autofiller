import { expect, fillThroughPopup, pageState, test } from "../support/harness";

const INDIA = { emailDomain: "sample.com", country: "IN", phoneFormat: "international" };

test.describe("framework compatibility", () => {
  test("plain HTML, shadow DOM and same-origin frames", async ({ extension, open }) => {
    const page = await open("plain");

    const result = await fillThroughPopup(extension, page, INDIA);

    expect(result).toMatchObject({ errors: 0, unsupported: 0, skipped: 9 });
    const state = await pageState(page);
    expect(state.a1).toMatch(/@sample\.com$/);
    expect(state.a3).toMatch(/^https:\/\//);
    expect(state.a4).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(state.a5).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(Number(state.a6)).toBeGreaterThanOrEqual(20);
    expect(Number(state.a6)).toBeLessThanOrEqual(25);
    expect(state.a7).toMatch(/^[A-Z]{5}\d{4}[A-Z]$/);
    expect(state.a9).toBe(state.a10);
    expect(state.len).toHaveLength(5);
    expect(state.pat).toMatch(/^[0-9]{4}$/);
    expect(state.ed).not.toBe("");
    expect(state.shadow).not.toBe("");
    expect(state.sameFrame).toBe(state.a1);
  });

  test("cross-origin frames stay out of reach", async ({ extension, open }) => {
    const page = await open("plain");

    await fillThroughPopup(extension, page);

    const frame = page.frames().find((candidate) => candidate.url().includes(":4174"));
    expect(frame).toBeDefined();
    expect(await frame?.evaluate(() => document.querySelector("input")?.value)).toBe("");
  });

  test("React state, dependent selects, MUI and react-select", async ({ extension, open }) => {
    const page = await open("react");

    const result = await fillThroughPopup(extension, page, INDIA);

    expect(result).toMatchObject({ errors: 0, unsupported: 0 });
    const state = await pageState(page);
    expect(state.email).toMatch(/@sample\.com$/);
    expect(state.phone).toMatch(/^\+91 /);
    expect(state.dob).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(state).toMatchObject({ country: "India", state: "Andhra Pradesh", city: "Visakhapatnam", zip: "530001", terms: true, muiRole: "dev", rsCountry: "India" });
    expect(state.muiCompany).not.toBe("");
    expect(state.muiAuto).not.toBe("");
    expect(state.notes).not.toBe("");
  });

  test("Vue v-model, including lazy and number modifiers", async ({ extension, open }) => {
    const page = await open("vue");

    const result = await fillThroughPopup(extension, page, INDIA);

    expect(result).toMatchObject({ errors: 0, unsupported: 0 });
    const state = await pageState(page);
    expect(state).toMatchObject({ country: "India", agree: true, plan: "free" });
    expect(typeof state.age).toBe("number");
    expect(["Andhra Pradesh", "Karnataka"]).toContain(state.state);
    expect(state.lazyCity).not.toBe("");
  });

  test("Angular reactive forms stay valid and touched", async ({ extension, open }) => {
    const page = await open("angular");

    const result = await fillThroughPopup(extension, page, INDIA);

    expect(result).toMatchObject({ errors: 0, unsupported: 0 });
    expect(await pageState(page)).toMatchObject({ country: "India", state: "Karnataka", terms: true, valid: true, touchedName: true });
  });

  test("Ant Design and Headless UI", async ({ extension, open }) => {
    const page = await open("libs");

    const result = await fillThroughPopup(extension, page, INDIA);

    expect(result).toMatchObject({ errors: 0, unsupported: 0 });
    const state = await pageState(page);
    expect(state).toMatchObject({ antCountry: "India", headless: "Developer" });
    expect(state.antName).not.toBe("");
    expect(state.antDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  for (const name of ["plain", "react", "vue", "angular", "libs", "dates"]) {
    test(`a second fill changes nothing on ${name}`, async ({ extension, open }) => {
      const page = await open(name);
      await fillThroughPopup(extension, page);
      const before = await pageState(page);

      const again = await fillThroughPopup(extension, page);

      expect(again).toMatchObject({ filled: 0, errors: 0, unsupported: 0 });
      expect(await pageState(page)).toEqual(before);
    });
  }
});

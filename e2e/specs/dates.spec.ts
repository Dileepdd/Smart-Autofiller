import { expect, fillThroughPopup, pageState, test } from "../support/harness";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

test.describe("date pickers", () => {
  // Read from each component's own state, because a value shown in an input can still be ignored.
  for (const widget of ["ant", "mui", "rdp", "flat", "el"]) {
    test(`${widget} accepts the date of birth`, async ({ extension, open }) => {
      const page = await open("dates");

      await fillThroughPopup(extension, page);

      expect((await pageState(page))[widget]).toMatch(ISO_DATE);
    });
  }

  test("every picker receives the same date of birth, matching the age range", async ({ extension, open }) => {
    const page = await open("dates");

    const result = await fillThroughPopup(extension, page, { ageMin: "30", ageMax: "30" });

    expect(result).toMatchObject({ errors: 0, unsupported: 0 });
    const { ant, mui, rdp, flat, el } = await pageState(page);
    expect(new Set([ant, mui, rdp, flat, el]).size).toBe(1);
    const year = new Date().getFullYear();
    expect([year - 30, year - 31]).toContain(new Date(ant).getFullYear());
  });

  test("no picker submits the surrounding form", async ({ extension, open }) => {
    const page = await open("dates");

    await fillThroughPopup(extension, page);

    expect((await pageState(page)).submitted).toBe(false);
  });
});

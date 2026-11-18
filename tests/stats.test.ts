import { describe, expect, it } from "vitest";
import { fillPage } from "../src/content/filler";
import { countTypes } from "../src/content/report";
import { duration } from "../src/popup/dashboard";
import { addFill, dayKey, migrateStats, secondsFor } from "../src/shared/stats";
import { render, settingsWith } from "./helpers";

const NOW = new Date(2026, 10, 18, 10);

describe("usage statistics", () => {
  it("adds a whole-form fill: counts, time saved, mode, problems and the day", () => {
    const stats = addFill(migrateStats(undefined), { byType: { text: 4, dropdown: 2, choice: 2 }, ms: 1500 }, "invalid", 1, true, NOW);
    expect(stats).toMatchObject({ fills: 1, fields: 8, fillMs: 1500, problems: 1, byMode: { invalid: 1 } });
    expect(stats.secondsSaved).toBe(4 * 5 + 2 * 3 + 2 * 1.5);
    expect(stats.days[dayKey(NOW)]).toEqual([1, 8]);
  });

  it("counts a single field from the menu as fields filled, not as a form", () => {
    const stats = addFill(migrateStats(undefined), { byType: { text: 1 }, ms: 0 }, "valid", 0, false, NOW);
    expect(stats).toMatchObject({ fills: 0, fields: 1, byMode: {} });
    expect(stats.days[dayKey(NOW)]).toEqual([0, 1]);
  });

  it("adds up across fills and keeps per-type totals", () => {
    let stats = migrateStats(undefined);
    stats = addFill(stats, { byType: { email: 1 }, ms: 100 }, "valid", 0, true, NOW);
    stats = addFill(stats, { byType: { email: 2, date: 1 }, ms: 300 }, "valid", 0, true, NOW);
    expect(stats).toMatchObject({ fills: 2, fields: 4, fillMs: 400, byType: { email: 3, date: 1 }, byMode: { valid: 2 } });
  });

  it("forgets days older than 90", () => {
    const old = new Date(NOW);
    old.setDate(old.getDate() - 120);
    const stats = addFill(migrateStats({ days: { [dayKey(old)]: [5, 50] } }), { byType: {}, ms: 0 }, "valid", 0, true, NOW);
    expect(Object.keys(stats.days)).toEqual([dayKey(NOW)]);
  });

  it("treats damaged stored numbers as zero", () => {
    const stats = migrateStats({ fills: "lots", fields: -3, byType: { text: "x", email: 2 }, days: { "2026-11-01": [1, "y"], bad: 7 } });
    expect(stats).toMatchObject({ fills: 0, fields: 0, byType: { text: 0, email: 2 }, days: { "2026-11-01": [1, 0] } });
  });

  it("estimates time from the field mix", () => {
    expect(secondsFor({ longText: 1, number: 2 })).toBe(12 + 6);
  });

  it.each([[40, "40 s"], [600, "10 min"], [3600, "1 h"], [12000, "3 h 20 min"]])("shows %i seconds as %s", (seconds, text) => {
    expect(duration(seconds)).toBe(text);
  });
});

describe("fill statistics from the page", () => {
  it("counts fields by type without any values", async () => {
    render(`
      <label for="a">Name</label><input id="a">
      <label for="b">Email</label><input id="b" type="email">
      <label for="c">About</label><textarea id="c"></textarea>
      <label for="d">Plan</label><select id="d"><option value="">Select</option><option>Basic</option></select>`);

    const result = await fillPage(settingsWith());

    expect(result.stats?.byType).toEqual({ text: 1, email: 1, longText: 1, dropdown: 1 });
    expect(result.stats?.ms).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(result.stats)).not.toContain("@");
  });

  it("groups checkboxes, dates and phones", () => {
    document.body.innerHTML = '<input type="checkbox"><input type="date"><input type="tel"><input type="number">';
    expect(countTypes(Array.from(document.querySelectorAll("input")))).toEqual({ choice: 1, date: 1, phone: 1, number: 1 });
  });
});

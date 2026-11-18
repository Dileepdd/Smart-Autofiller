import { describe, expect, it } from "vitest";
import { fillPage } from "../src/content/filler";
import { formatReport, lastFill, reportIssues } from "../src/content/report";
import { createProfile } from "../src/generators/profile";
import { LOCALES } from "../src/generators/locales";
import { sanitizeProfiles } from "../src/shared/profiles";
import { exportFile, readExportFile } from "../src/shared/settings";
import { DEFAULT_SETTINGS } from "../src/shared/types";
import { find, render, settingsWith } from "./helpers";

describe("all US states", () => {
  const us = LOCALES.find(({ code }) => code === "US")!;

  it("has every state and DC, each with a city and a five-digit ZIP code", () => {
    expect(us.regions).toHaveLength(51);
    expect(new Set(us.regions.map(({ code }) => code)).size).toBe(51);
    for (const region of us.regions) {
      expect(region.cities.length).toBeGreaterThan(0);
      for (const city of region.cities) expect(city.postalCode).toMatch(/^\d{5}$/);
    }
  });

  it.each([["Alabama", "3"], ["Alaska", "99"], ["Texas", "7"], ["Massachusetts", "02"], ["Wyoming", "82"]])("gives %s a ZIP code from that state", (state, prefix) => {
    const region = us.regions.find(({ name }) => name === state)!;
    for (const city of region.cities) expect(city.postalCode.startsWith(prefix)).toBe(true);
  });

  it("keeps a state chosen on the page and its city and ZIP code together", async () => {
    render(`
      <label for="state">State</label><select id="state"><option value="">Select</option><option selected>Alabama</option></select>
      <label for="city">City</label><input id="city">
      <label for="zip">ZIP code</label><input id="zip">`);

    await fillPage(settingsWith({ country: "US", fillExisting: false }));

    expect(["Birmingham", "Montgomery"]).toContain(find("#city").value);
    expect(find("#zip").value).toMatch(/^36|^35/);
  });
});

describe("city names shared by two states", () => {
  it("keeps the state a page chose when its city name also exists elsewhere", async () => {
    const { adoptCity, adoptRegion } = await import("../src/generators/profile");
    const profile = createProfile(settingsWith({ country: "US", nameRegion: "country" }));
    adoptRegion(profile, "Oregon");
    adoptCity(profile, "Portland");
    expect(profile).toMatchObject({ region: "Oregon", postalCode: "97204" });
    adoptRegion(profile, "Maine");
    adoptCity(profile, "Portland");
    expect(profile).toMatchObject({ region: "Maine", postalCode: "04101" });
  });
});

describe("copy for bug reports", () => {
  const report = {
    page: "https://app.example.test/signup",
    filledAt: "2026-11-18T10:00:00.000Z",
    dataMode: "Valid data",
    fields: [{ field: "First name", value: "Asha" }, { field: "Notes", value: "a | b\nc" }],
    issues: ["Invalid: zip – Invalid Code"]
  };

  it("writes Markdown with a table that a pipe or line break cannot break", () => {
    const text = formatReport(report, "markdown");
    expect(text).toContain("| Field | Value |");
    expect(text).toContain("| First name | Asha |");
    expect(text).toContain("| Notes | a \\| b c |");
    expect(text).toContain("- Invalid: zip – Invalid Code");
    expect(text).toContain("Page: https://app.example.test/signup");
  });

  it("writes plain text, one field per line", () => {
    expect(formatReport(report, "text")).toContain("First name: Asha");
  });

  it("writes JSON that reads back to the same report", () => {
    expect(JSON.parse(formatReport(report, "json"))).toEqual(report);
  });

  it("keeps real problems as issues and leaves routine skips out", () => {
    expect(reportIssues(["Skipped: middle name", "Invalid: zip – Invalid Code", "Could not select an option: state"]))
      .toEqual(["Invalid: zip – Invalid Code", "Could not select an option: state"]);
  });

  it("remembers what a fill wrote, with the final values and readable field names", async () => {
    render(`
      <label for="first">First name</label><input id="first">
      <label for="pass">Password</label><input id="pass" type="password">
      <label for="plan">Plan</label><select id="plan"><option value="">Select</option><option>Basic</option></select>
      <label><input type="checkbox" required id="terms"> I agree</label>`);

    await fillPage(settingsWith());

    const fields = lastFill()!.fields;
    expect(fields).toEqual(expect.arrayContaining([
      { field: "First name", value: find("#first").value },
      { field: "Password", value: "••••••••" },
      { field: "Plan", value: "Basic" },
      { field: "I agree", value: "Checked" }
    ]));
    expect(JSON.stringify(lastFill())).not.toContain(find("#pass").value);
  });
});

describe("import and export", () => {
  const profiles = [{ id: "p1", name: "Staging", overrides: { country: "US" }, customRules: [{ match: "customer", value: "ACME" }] }];

  it("reads back exactly what it exported", () => {
    const settings = { ...DEFAULT_SETTINGS, emailDomain: "qa.example.test", country: "DE" as const };
    const read = readExportFile(JSON.stringify(exportFile(settings, profiles)));
    expect("error" in read).toBe(false);
    if ("error" in read) return;
    expect(read.settings).toMatchObject({ emailDomain: "qa.example.test", country: "DE" });
    expect(sanitizeProfiles(read.profiles)).toEqual(profiles);
  });

  it.each([["not JSON", "{oops"], ["another app's file", JSON.stringify({ app: "other", settings: {} })]])("refuses %s", (_name, text) => {
    expect(readExportFile(text)).toEqual({ error: "This file is not a Smart Autofill settings file." });
  });

  it("refuses a file from a newer version", () => {
    const file = { ...exportFile(DEFAULT_SETTINGS, []), version: 99 };
    expect(readExportFile(JSON.stringify(file))).toEqual({ error: "This file comes from a newer version. Update Smart Autofill first." });
  });

  it("gives damaged or unknown settings their defaults", () => {
    const file = { ...exportFile(DEFAULT_SETTINGS, []), settings: { country: "XX", ageMin: "lots", unknown: true, emailDomain: "team.test" } };
    const read = readExportFile(JSON.stringify(file));
    if ("error" in read) throw new Error(read.error);
    expect(read.settings.country).toBe(DEFAULT_SETTINGS.country);
    expect(read.settings.ageMin).toBe(DEFAULT_SETTINGS.ageMin);
    expect(read.settings.emailDomain).toBe("team.test");
    expect("unknown" in read.settings).toBe(false);
  });

  it("keeps only well-formed profiles and the values a profile may set", () => {
    const cleaned = sanitizeProfiles([
      ...profiles,
      { id: "", name: "No id" },
      { id: "p2", name: "  " },
      "nonsense",
      { id: "p3", name: "Mixed", overrides: { country: "IN", dataMode: "invalid", injected: "<script>" }, customRules: [{ match: "a", value: "b" }, { match: 1 }] }
    ]);
    expect(cleaned.map(({ id }) => id)).toEqual(["p1", "p3"]);
    expect(cleaned[1].overrides).toEqual({ country: "IN" });
    expect(cleaned[1].customRules).toEqual([{ match: "a", value: "b" }]);
  });

  it("imported profiles fill like any other", () => {
    const [profile] = sanitizeProfiles(profiles);
    expect(createProfile({ ...DEFAULT_SETTINGS, ...profile.overrides }).postalCode).toMatch(/^\d{5}$/);
  });
});

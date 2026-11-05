import { describe, expect, it } from "vitest";
import { customRuleErrors, formatCustomRules, migrateSettings, parseCustomRules, validateSettings } from "../src/shared/settings";
import { renderTemplate, templateError } from "../src/shared/template";
import { DEFAULT_SETTINGS, SETTINGS_VERSION } from "../src/shared/types";
import { settingsWith } from "./helpers";

describe("DEFAULT_SETTINGS", () => {
  it("defaults to India, filling on one click and replacing existing values", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ country: "IN", fillExisting: true, fillOnOpen: true, dropdownMode: "match", checkboxMode: "required" });
  });
});

describe("migrateSettings", () => {
  it("gives a first-time user the defaults", () => {
    expect(migrateSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps everything from an older save and adds the new settings", () => {
    const old = { emailDomain: "old.test", ageMin: 25, ageMax: 30, country: "GB", fillExisting: false, customRules: [{ match: "a", value: "b" }] };
    expect(migrateSettings(old)).toMatchObject({ ...old, settingsVersion: SETTINGS_VERSION, gender: "any", checkboxMode: "required" });
  });

  it('moves the old "first" dropdown setting to match, which is what it did', () => {
    expect(migrateSettings({ dropdownMode: "first" }).dropdownMode).toBe("match");
  });

  it("leaves a current strict first choice alone", () => {
    expect(migrateSettings({ settingsVersion: SETTINGS_VERSION, dropdownMode: "first" }).dropdownMode).toBe("first");
  });

  it.each([
    [{ ageMin: "18" }, "ageMin"],
    [{ ageMax: Number.NaN }, "ageMax"],
    [{ country: "XX" }, "country"],
    [{ checkboxMode: "some" }, "checkboxMode"],
    [{ decimalPrecision: 3 }, "decimalPrecision"],
    [{ fillExisting: "yes" }, "fillExisting"]
  ] as const)("replaces the unusable value %j with its default", (stored, key) => {
    expect(migrateSettings(stored)[key]).toBe(DEFAULT_SETTINGS[key]);
  });

  it("drops malformed custom rules", () => {
    expect(migrateSettings({ customRules: [{ match: "a", value: "b" }, { match: 1 }, "x"] }).customRules).toEqual([{ match: "a", value: "b" }]);
  });

  it("ignores unknown settings", () => {
    expect(migrateSettings({ removed: true })).not.toHaveProperty("removed");
  });

  it("survives storage that is not an object", () => {
    expect(migrateSettings("broken")).toEqual(DEFAULT_SETTINGS);
  });
});

describe("templates", () => {
  const render = (template: string): string => renderTemplate(template, { firstName: "Ada" }, (min) => min);

  it("fills profile tokens", () => {
    expect(render("hello {firstName}")).toBe("hello Ada");
  });

  it("fills number ranges", () => {
    expect(render("EMP-{number:1000-9999}")).toBe("EMP-1000");
  });

  it("accepts plain text and valid tokens", () => {
    expect(templateError("plain")).toBeUndefined();
    expect(templateError("{firstName}-{number:1-9}")).toBeUndefined();
  });

  it.each([
    ["{nope}", "Unknown token"],
    ["{number:9-1}", "minimum above"],
    ["{number:a-b}", "Unknown token"],
    ["{firstName", "Unmatched brace"],
    ["firstName}", "Unmatched brace"]
  ])("explains what is wrong with %j", (template, message) => {
    expect(templateError(template)).toContain(message);
  });
});

describe("validateSettings", () => {
  it("accepts the defaults", () => {
    expect(validateSettings(settingsWith())).toBeUndefined();
  });

  it.each([
    [{ ageMin: 50, ageMax: 20 }],
    [{ experienceMin: 10, experienceMax: 5 }],
    [{ emailDomain: "" }],
    [{ emailDomain: "not a domain" }],
    [{ numberMin: 10, numberMax: 1 }],
    [{ companySizeMin: 100, companySizeMax: 10 }],
    [{ dateStart: "2026-02-01", dateEnd: "2026-01-01" }],
    [{ employeeIdPattern: "EMP-{number:9-1}" }],
    [{ passwordPattern: "{oops}" }],
    [{ customRules: [{ match: "a", value: "{oops}" }] }]
  ])("rejects %j", (overrides) => {
    expect(validateSettings(settingsWith(overrides))).toBeTruthy();
  });
});

describe("custom rule text", () => {
  it("reports each invalid line with its number", () => {
    expect(customRuleErrors("good = 1\nno separator\n\n= value\nkey = {oops}")).toEqual([
      "Rule on line 2: Use the form keyword = value.",
      "Rule on line 4: Use the form keyword = value.",
      expect.stringContaining("Rule on line 5: Unknown token")
    ]);
  });

  it("finds nothing wrong with valid rules and blank lines", () => {
    expect(customRuleErrors("employee id = EMP-{number:1000-9999}\n\ndepartment = Engineering")).toEqual([]);
  });

  it("parses one rule per line and keeps = inside values", () => {
    expect(parseCustomRules("employee id = EMP-1\nquery = a=b")).toEqual([
      { match: "employee id", value: "EMP-1" },
      { match: "query", value: "a=b" }
    ]);
  });

  it("ignores blank and incomplete lines", () => {
    expect(parseCustomRules("\nno separator\n= value\nkey =\n")).toEqual([]);
  });

  it("round-trips through the popup text format", () => {
    const rules = [{ match: "alias", value: "{firstName}" }];
    expect(parseCustomRules(formatCustomRules(rules))).toEqual(rules);
  });
});

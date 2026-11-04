import { describe, expect, it } from "vitest";
import { formatCustomRules, parseCustomRules, validateSettings } from "../src/shared/settings";
import { DEFAULT_SETTINGS } from "../src/shared/types";
import { settingsWith } from "./helpers";

describe("DEFAULT_SETTINGS", () => {
  it("defaults to India, filling on one click and replacing existing values", () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ country: "IN", fillExisting: true, fillOnOpen: true, dropdownMode: "first" });
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
    [{ emailDomain: "not a domain" }]
  ])("rejects %j", (overrides) => {
    expect(validateSettings(settingsWith(overrides))).toBeTruthy();
  });
});

describe("custom rule text", () => {
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

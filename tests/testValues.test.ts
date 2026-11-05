import { describe, expect, it } from "vitest";
import { verhoeffDigit } from "../src/generators/identifiers";
import { INVALID_VALUES, testValue } from "../src/generators/testValues";
import { VALUE_LIBRARY, SECURITY_VALUES, libraryFor } from "../src/shared/valueLibrary";
import { find, render } from "./helpers";

const field = (attributes: string): HTMLInputElement => {
  render(`<input id="field" ${attributes}>`);
  return find("#field");
};

describe("valid mode", () => {
  it("leaves the value alone", () => {
    expect(testValue("valid", "email", "a@example.com", field("maxlength=5"))).toBe("a@example.com");
  });
});

describe("invalid mode", () => {
  it.each([
    ["email", "user@@example"],
    ["phone", "12345"],
    ["url", "not a url"],
    ["pan", "ABCDE12345"],
    ["date", "2024-13-45"]
  ] as const)("gives %s a wrong value", (kind, expected) => {
    expect(testValue("invalid", kind, "valid", field(""))).toBe(expected);
  });

  it("gives Aadhaar a number whose check digit is wrong", () => {
    const { aadhaar } = INVALID_VALUES;
    expect(aadhaar).toHaveLength(12);
    expect(aadhaar?.at(-1)).not.toBe(verhoeffDigit(aadhaar!.slice(0, 11)));
  });

  it("gives every invalid value once, so a confirmation field still matches", () => {
    expect(testValue("invalid", "password", "x", field(""))).toBe(testValue("invalid", "password", "y", field("")));
  });

  it("goes one over a declared maximum length", () => {
    expect(testValue("invalid", "company", "Acme", field("maxlength=10"))).toHaveLength(11);
  });

  it("goes one under a declared minimum length", () => {
    expect(testValue("invalid", "company", "Acme Holdings", field("minlength=5"))).toHaveLength(4);
  });

  it("breaks a declared pattern when the kind has no bad value of its own", () => {
    expect(testValue("invalid", "company", "Acme", field("pattern='[A-Za-z]+'"))).toBe("!!!");
  });

  it("keeps the value when nothing says what would be wrong", () => {
    expect(testValue("invalid", "company", "Acme", field(""))).toBe("Acme");
  });

  it("goes past the limits of a number input, which cannot hold text", () => {
    expect(testValue("invalid", "age", "30", field("type=number min=18 max=65"))).toBe("66");
    expect(testValue("invalid", "age", "30", field("type=number min=18"))).toBe("17");
    expect(testValue("invalid", "number", "30", field("type=number"))).toBe("-1");
  });

  it("goes past the limits of a date input", () => {
    expect(testValue("invalid", "date", "2024-06-01", field("type=date max=2024-12-31"))).toBe("2025-01-01");
    expect(testValue("invalid", "date", "2024-06-01", field("type=date min=2024-03-01"))).toBe("2024-02-29");
    expect(testValue("invalid", "date", "2024-06-01", field("type=date"))).toBe("2024-06-01");
  });

  it("leaves inputs that only hold well-formed values", () => {
    expect(testValue("invalid", "time", "10:00", field("type=time"))).toBe("10:00");
  });

  it("works without an element, for editable regions", () => {
    expect(testValue("invalid", "email", "a@example.com")).toBe("user@@example");
  });
});

describe("minimum and maximum modes", () => {
  it("fills to exactly the declared length", () => {
    expect(testValue("maximum", "company", "Acme", field("maxlength=12"))).toBe("Acmexxxxxxxx");
    expect(testValue("minimum", "company", "Acme Holdings", field("minlength=4"))).toBe("Acme");
  });

  it("keeps an email address valid at its limit", () => {
    const value = testValue("maximum", "email", "ab@example.com", field("maxlength=30"));
    expect(value).toHaveLength(30);
    expect(value).toMatch(/^x*abx*@example\.com$|^abx+@example\.com$/);
  });

  it("extends a number string with digits", () => {
    expect(testValue("maximum", "phone", "98765", field("maxlength=8"))).toBe("98765111");
  });

  it("keeps the valid value when reaching the limit would break the field's pattern", () => {
    expect(testValue("maximum", "zip", "12345", field("maxlength=10 pattern='[0-9]{5}'"))).toBe("12345");
  });

  it("keeps the valid value when no limit is declared", () => {
    expect(testValue("maximum", "company", "Acme", field(""))).toBe("Acme");
    expect(testValue("minimum", "company", "Acme", field(""))).toBe("Acme");
  });

  it("uses the limits of number and date inputs", () => {
    expect(testValue("minimum", "age", "30", field("type=number min=18 max=65"))).toBe("18");
    expect(testValue("maximum", "age", "30", field("type=number min=18 max=65"))).toBe("65");
    expect(testValue("minimum", "date", "2024-06-01", field("type=date min=2024-03-01"))).toBe("2024-03-01");
    expect(testValue("maximum", "date", "2024-06-01", field("type=date max=2024-12-31"))).toBe("2024-12-31");
  });

  it("stays on a step when the maximum is not on one", () => {
    expect(testValue("maximum", "number", "5", field("type=number min=0 max=10 step=3"))).toBe("9");
    expect(testValue("maximum", "number", "5", field("type=number min=0 max=1 step=0.1"))).toBe("1");
  });
});

describe("edge case mode", () => {
  it("gives names awkward but valid values", () => {
    expect(["O'Brien", "Smith-Jones", "García-López", "van der Berg", "Ng"]).toContain(testValue("edge", "lastName", "Rao", field("")));
  });

  it("keeps the page's email domain", () => {
    expect(testValue("edge", "email", "a@sample.com", field(""))).toBe("first.last+qa_1@sample.com");
  });

  it("respects a maximum length", () => {
    expect(testValue("edge", "company", "Acme", field("maxlength=3")).length).toBeLessThanOrEqual(3);
  });

  it("keeps the valid value when the awkward one would break the field's pattern", () => {
    expect(testValue("edge", "firstName", "Asha", field("pattern='[0-9]+'"))).toBe("Asha");
  });

  it("uses zero and a leap day in number and date inputs, where allowed", () => {
    expect(testValue("edge", "number", "5", field("type=number"))).toBe("0");
    expect(testValue("edge", "number", "5", field("type=number min=1"))).toBe("5");
    expect(testValue("edge", "date", "2024-06-01", field("type=date"))).toBe("2024-02-29");
    expect(testValue("edge", "date", "2024-06-01", field("type=date min=2025-01-01"))).toBe("2024-06-01");
  });

  it("leaves identifiers valid", () => {
    expect(testValue("edge", "pan", "ABCDE1234F", field(""))).toBe("ABCDE1234F");
  });
});

describe("value library", () => {
  it("has values in every category", () => {
    for (const { values } of [...VALUE_LIBRARY, SECURITY_VALUES]) expect(values.length).toBeGreaterThan(0);
  });

  it("makes the length values exactly as long as they say", () => {
    const length = VALUE_LIBRARY.find(({ id }) => id === "length");
    for (const { label, value } of length?.values ?? []) expect(value).toHaveLength(parseInt(label, 10));
  });

  it("only includes security strings when asked", () => {
    expect(libraryFor(false)).not.toContain(SECURITY_VALUES);
    expect(libraryFor(true)).toContain(SECURITY_VALUES);
  });
});

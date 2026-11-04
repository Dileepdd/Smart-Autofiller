import { expect, fillThroughPopup, pageState, test } from "../support/harness";

interface CountryFormat {
  code: string;
  name: string;
  taxId: RegExp;
  phone: RegExp;
  postal: RegExp;
  /** Only India has a separate format; elsewhere a GSTIN field receives the tax ID. */
  gstin?: RegExp;
}

const COUNTRIES: CountryFormat[] = [
  { code: "IN", name: "India", taxId: /^[A-Z]{3}P[A-Z]\d{4}[A-Z]$/, phone: /^9\d{4} \d{5}$/, postal: /^\d{6}$/, gstin: /^\d{2}[A-Z]{3}P[A-Z]\d{4}[A-Z]1Z\d$/ },
  { code: "US", name: "United States", taxId: /^12-\d{7}$/, phone: /^\(2\d{2}\) 555-01\d{2}$/, postal: /^\d{5}$/ },
  { code: "GB", name: "United Kingdom", taxId: /^GB\d{9}$/, phone: /^07700 900\d{3}$/, postal: /^[A-Z]{1,2}\d{1,2} \d[A-Z]{2}$/ },
  { code: "CA", name: "Canada", taxId: /^\d{9}RT0001$/, phone: /^\(2\d{2}\) 555-01\d{2}$/, postal: /^[A-Z]\d[A-Z] \d[A-Z]\d$/ },
  { code: "AU", name: "Australia", taxId: /^\d{2} \d{3} \d{3} \d{3}$/, phone: /^0491 570 \d{3}$/, postal: /^\d{4}$/ }
];

const digits = (value: string): string => value.replace(/\D/g, "");

test.describe("generated data in a real form", () => {
  for (const country of COUNTRIES) {
    test(`${country.name}: every field type`, async ({ extension, open }) => {
      const page = await open("data");

      const result = await fillThroughPopup(extension, page, { country: country.code, emailDomain: "sample.com", domainSuffix: ".io" });

      expect(result).toMatchObject({ errors: 0, unsupported: 0, skipped: 0 });
      expect(result.details).toEqual([]);
      const state = await pageState(page);
      expect(state.invalid).toEqual([]);

      // Identity
      expect(state.fullName).toBe(`${state.firstName} ${state.lastName}`);
      const local = state.email.split("@")[0];
      expect(local).toContain(state.firstName.toLowerCase().replace(/[^a-z0-9]/g, ""));
      expect(local).toContain(state.lastName.toLowerCase().replace(/[^a-z0-9]/g, ""));
      expect(state.email).toMatch(/^[a-z0-9.]+@sample\.com$/);

      // Company, domain and website all describe the same company.
      const companySlug = state.company.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 32);
      expect(state.domain).toBe(`${companySlug}.io`);
      expect(state.domain).toMatch(/^[a-z0-9]+\.io$/);
      expect(state.website).toBe(`https://${state.domain}`);
      expect(state.websiteUrl).toBe(state.website);

      // Tax IDs
      expect(state.taxId).toMatch(country.taxId);
      expect(state.taxCamel).toBe(state.taxId);
      expect(state.taxShort.length).toBeLessThanOrEqual(12);
      expect(digits(state.taxId)).toContain(digits(state.taxShort).slice(0, 4));
      expect(state.gstin).toMatch(country.gstin ?? country.taxId);

      // Phones, including fields that only take digits. All are the same number.
      expect(state.mobile).toMatch(country.phone);
      expect(state.tel).toBe(state.mobile);
      const number = digits(state.mobile);
      expect(state.mobileMax).toHaveLength(10);
      expect(state.mobileMax).toMatch(/^\d{10}$/);
      expect(number.endsWith(state.mobileMax)).toBe(true);
      expect(state.mobileDigits).toBe(state.mobileMax);
      expect(state.mobileNumber).not.toBe("");

      // Location is one consistent address.
      expect(state.zip).toMatch(country.postal);
      expect(state.zipCamel).toBe(state.zip);
      expect(state.pin).toBe(state.zip);
      expect(state.zipNumber).not.toBe("");
      expect(state.country).toBe(country.name);
      expect(state.address).toContain(state.street);
      expect(state.address).toContain(state.city);
      expect(state.address).toContain(state.state);
      expect(state.address).toContain(state.zip);
    });
  }

  test("international phone format applies to every phone field", async ({ extension, open }) => {
    const page = await open("data");

    await fillThroughPopup(extension, page, { country: "IN", phoneFormat: "international" });

    const state = await pageState(page);
    expect(state.mobile).toMatch(/^\+91 9\d{4} \d{5}$/);
    expect(state.mobileMax).toMatch(/^9\d{9}$/);
  });
});

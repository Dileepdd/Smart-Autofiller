import { fakerEN_IN } from "@faker-js/faker";
import { describe, expect, it } from "vitest";
import { findCity, findLocale, LOCALES } from "../src/generators/locales";
import { verhoeffDigit } from "../src/generators/identifiers";
import { adoptCity, adoptCountry, adoptRegion, createProfile, dropdownTargets, Profile, profileTokens } from "../src/generators/profile";
import { customRuleValue, dateCandidates, GeneratedKind, generateValue } from "../src/generators/values";
import { PROFILE_TOKENS } from "../src/shared/template";
import { AutofillSettings } from "../src/shared/types";
import { find, render, settingsWith } from "./helpers";

const SAMPLES = 200;

const sampleProfiles = (overrides: Partial<AutofillSettings> = {}) =>
  Array.from({ length: SAMPLES }, () => createProfile(settingsWith(overrides)));

const ageOn = (birth: Date, today = new Date()): number => {
  const hadBirthday = today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  return today.getFullYear() - birth.getFullYear() - (hadBirthday ? 0 : 1);
};

const generateFor = (html: string, kind: GeneratedKind, overrides: Partial<AutofillSettings> = {}): string => {
  render(html);
  const settings = settingsWith(overrides);
  return generateValue(kind, settings, createProfile(settings), find<HTMLInputElement>("#field"));
};

describe("createProfile identity", () => {
  it("keeps the middle name separate from the full name", () => {
    const profile = createProfile(settingsWith());
    expect(profile.middleName).not.toBe("");
    expect(profile.fullName.split(" ").length).toBeGreaterThanOrEqual(2);
    expect(profile.fullName).toBe(`${profile.firstName} ${profile.lastName}`);
  });

  it("builds the full name from the first and last name", () => {
    const profile = createProfile(settingsWith());
    expect(profile.fullName).toBe(`${profile.firstName} ${profile.lastName}`);
  });

  it("builds the email from the person's name", () => {
    const profile = createProfile(settingsWith({ emailDomain: "acme.test" }));
    const local = profile.email.split("@")[0];
    expect(local).toContain(profile.firstName.toLowerCase().replace(/[^a-z0-9]/g, ""));
    expect(local).toContain(profile.lastName.toLowerCase().replace(/[^a-z0-9]/g, ""));
  });

  it("uses the custom email domain", () => {
    const { email } = createProfile(settingsWith({ emailDomain: "qa.acme.test" }));
    expect(email).toMatch(/^[a-z0-9]+\.[a-z0-9]+@qa\.acme\.test$/);
  });

  it("strips a leading @ from the email domain", () => {
    expect(createProfile(settingsWith({ emailDomain: "@acme.test" })).email).toMatch(/[^@]@acme\.test$/);
  });

  it("falls back to example.com for a blank email domain", () => {
    expect(createProfile(settingsWith({ emailDomain: "   " })).email).toMatch(/@example\.com$/);
  });

  it("derives the domain and website from the company", () => {
    const { company, domain, website } = createProfile(settingsWith({ domainSuffix: ".io" }));
    expect(domain).toBe(`${company.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 32)}.io`);
    expect(website).toBe(`https://${domain}`);
  });

  it.each([".io", "io"])("applies the domain suffix %j", (domainSuffix) => {
    expect(createProfile(settingsWith({ domainSuffix })).domain).toMatch(/^[a-z0-9]+\.io$/);
  });
});

describe("createProfile age and experience", () => {
  it("keeps ages inside the configured range", () => {
    const ages = sampleProfiles({ ageMin: 30, ageMax: 35 }).map(({ age }) => age);
    expect(Math.min(...ages)).toBeGreaterThanOrEqual(30);
    expect(Math.max(...ages)).toBeLessThanOrEqual(35);
  });

  it("keeps experience inside the configured range", () => {
    const years = sampleProfiles({ experienceMin: 3, experienceMax: 7 }).map(({ experience }) => experience);
    expect(Math.min(...years)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...years)).toBeLessThanOrEqual(7);
  });

  it("returns the exact value when a range has one number", () => {
    const profiles = sampleProfiles({ ageMin: 42, ageMax: 42, experienceMin: 5, experienceMax: 5 });
    expect(new Set(profiles.map(({ age }) => age))).toEqual(new Set([42]));
    expect(new Set(profiles.map(({ experience }) => experience))).toEqual(new Set([5]));
  });

  it("tolerates reversed ranges", () => {
    const ages = sampleProfiles({ ageMin: 35, ageMax: 30 }).map(({ age }) => age);
    expect(Math.min(...ages)).toBeGreaterThanOrEqual(30);
    expect(Math.max(...ages)).toBeLessThanOrEqual(35);
  });

  it("never gives someone more experience than working years", () => {
    for (const { age, experience } of sampleProfiles({ ageMin: 18, ageMax: 30, experienceMin: 0, experienceMax: 20 })) {
      expect(experience).toBeLessThanOrEqual(age - 18);
    }
  });

  it("raises the age when the minimum experience requires it", () => {
    for (const { age } of sampleProfiles({ ageMin: 18, ageMax: 60, experienceMin: 10, experienceMax: 20 })) {
      expect(age).toBeGreaterThanOrEqual(28);
    }
  });

  it("keeps the configured ranges when they cannot both hold", () => {
    const profile = createProfile(settingsWith({ ageMin: 18, ageMax: 18, experienceMin: 20, experienceMax: 20 }));
    expect(profile).toMatchObject({ age: 18, experience: 20 });
  });

  it("derives a date of birth that matches the age", () => {
    for (const { age, dateOfBirth } of sampleProfiles()) {
      expect(ageOn(dateOfBirth)).toBe(age);
    }
  });
});

describe("createProfile location", () => {
  it.each(LOCALES.map(({ code }) => code))("keeps %s geographically consistent", (country) => {
    for (const profile of sampleProfiles({ country })) {
      const locale = findLocale(profile.country);
      const match = locale && findCity(locale, profile.city, profile.region);
      expect(locale?.code).toBe(country);
      expect(match?.region.name).toBe(profile.region);
      expect(match?.city.postalCode).toBe(profile.postalCode);
    }
  });

  it.each<[AutofillSettings["country"], RegExp]>([
    ["US", /^12-\d{7}$/],
    ["IN", /^[A-Z]{5}\d{4}[A-Z]$/],
    ["GB", /^GB\d{9}$/],
    ["CA", /^\d{9}RT0001$/],
    ["AU", /^\d{2} \d{3} \d{3} \d{3}$/]
  ])("formats the tax ID for %s", (country, format) => {
    expect(createProfile(settingsWith({ country })).taxId).toMatch(format);
  });

  it.each<[AutofillSettings["country"], RegExp]>([
    ["US", /^\+1 2\d{2} 555 01\d{2}$/],
    ["IN", /^\+91 9\d{4} \d{5}$/],
    ["GB", /^\+44 7700 900\d{3}$/],
    ["AU", /^\+61 491 570 \d{3}$/]
  ])("formats an international phone number for %s", (country, format) => {
    expect(createProfile(settingsWith({ country, phoneFormat: "international" })).phone).toMatch(format);
  });

  it("formats a national phone number", () => {
    expect(createProfile(settingsWith({ country: "GB", phoneFormat: "national" })).phone).toMatch(/^07700 900\d{3}$/);
  });
});

describe("adopting what the page offers", () => {
  it("rebuilds the location, phone and tax ID for a different supported country", () => {
    const settings = settingsWith({ country: "US" });
    const profile = createProfile(settings);

    adoptCountry(profile, "India", settings);

    expect(profile).toMatchObject({ country: "India", countryCode: "IN" });
    expect(findCity(LOCALES[1], profile.city)?.city.postalCode).toBe(profile.postalCode);
    expect(profile.phone).toMatch(/^9\d{4} \d{5}$/);
    expect(profile.taxId).toMatch(/^[A-Z]{5}\d{4}[A-Z]$/);
  });

  it("keeps an unsupported country's name", () => {
    const settings = settingsWith();
    const profile = createProfile(settings);

    adoptCountry(profile, "Atlantis", settings);

    expect(profile.country).toBe("Atlantis");
  });

  it("picks a city inside an adopted region", () => {
    const profile = createProfile(settingsWith({ country: "IN" }));

    adoptRegion(profile, "Karnataka");

    expect(profile.region).toBe("Karnataka");
    expect(["Bengaluru", "Mysuru"]).toContain(profile.city);
  });

  it("takes the region and postal code from an adopted city", () => {
    const profile = createProfile(settingsWith({ country: "IN" }));

    adoptCity(profile, "Visakhapatnam");

    expect(profile).toMatchObject({ region: "Andhra Pradesh", postalCode: "530001" });
  });

  it("offers names and codes as dropdown targets", () => {
    const profile = createProfile(settingsWith({ country: "GB" }));
    expect(dropdownTargets("country", profile)).toEqual(expect.arrayContaining(["United Kingdom", "GB", "UK", "+44"]));
    expect(dropdownTargets("state", profile)).toEqual([profile.region, profile.regionCode]);
    expect(dropdownTargets("company", profile)).toEqual([]);
  });
});

describe("generateValue", () => {
  const profile = createProfile(settingsWith());

  it.each<[GeneratedKind, string]>([
    ["firstName", profile.firstName],
    ["middleName", profile.middleName],
    ["lastName", profile.lastName],
    ["fullName", profile.fullName],
    ["email", profile.email],
    ["company", profile.company],
    ["domain", profile.domain],
    ["website", profile.website],
    ["username", profile.username],
    ["password", profile.password],
    ["phone", profile.phone],
    ["taxId", profile.taxId],
    ["city", profile.city],
    ["state", profile.region],
    ["country", profile.country],
    ["zip", profile.postalCode],
    ["age", String(profile.age)],
    ["experience", String(profile.experience)]
  ])("returns the profile's %s", (kind, expected) => {
    expect(generateValue(kind, settingsWith(), profile)).toBe(expected);
  });

  it("repeats the password so confirmation fields match", () => {
    expect(generateValue("password", settingsWith(), profile)).toBe(generateValue("password", settingsWith(), profile));
  });

  it("writes an ISO date of birth into a date input", () => {
    expect(generateFor('<input id="field" type="date">', "dateOfBirth")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("uses the saved date format in text fields", () => {
    expect(generateFor('<input id="field">', "dateOfBirth", { dateFormat: "DD/MM/YYYY" })).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it("prefers the format shown in the field's placeholder", () => {
    expect(generateFor('<input id="field" placeholder="mm-dd-yyyy">', "date", { dateFormat: "YYYY-MM-DD" })).toMatch(/^\d{2}-\d{2}-\d{4}$/);
  });

  it("generates a date in the future when asked", () => {
    expect(new Date(generateFor('<input id="field" type="date">', "futureDate")).getTime()).toBeGreaterThan(Date.now() - 86400000);
  });

  it.each<[GeneratedKind, RegExp]>([
    ["time", /^\d{2}:\d{2}$/],
    ["month", /^\d{4}-\d{2}$/],
    ["week", /^\d{4}-W\d{2}$/],
    ["dateTime", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/]
  ])("uses the browser's format for %s", (kind, format) => {
    expect(generateValue(kind, settingsWith(), profile)).toMatch(format);
  });
});

describe("field constraints", () => {
  it("truncates to maxlength", () => {
    expect(generateFor('<input id="field" maxlength="3">', "company")).toHaveLength(3);
  });

  it("clamps an age to the field's max", () => {
    expect(generateFor('<input id="field" type="number" max="20">', "age", { ageMin: 30, ageMax: 30 })).toBe("20");
  });

  it("clamps an age to the field's min", () => {
    expect(generateFor('<input id="field" type="number" min="40">', "age", { ageMin: 30, ageMax: 30 })).toBe("40");
  });

  it("clamps a date to the field's range", () => {
    expect(generateFor('<input id="field" type="date" max="2000-01-01">', "date")).toBe("2000-01-01");
  });

  it("respects min and max on generic numbers", () => {
    for (let sample = 0; sample < 50; sample++) {
      const value = Number(generateFor('<input id="field" type="number" min="5" max="7">', "number"));
      expect(value).toBeGreaterThanOrEqual(5);
      expect(value).toBeLessThanOrEqual(7);
    }
  });

  it("stays above a min larger than the default maximum", () => {
    expect(Number(generateFor('<input id="field" type="number" min="500">', "number"))).toBeGreaterThanOrEqual(500);
  });

  it("generates from a pattern the value would otherwise fail", () => {
    expect(generateFor('<input id="field" pattern="[0-9]{6}">', "zip", { country: "GB" })).toMatch(/^[0-9]{6}$/);
  });

  it("keeps a value that already matches the pattern", () => {
    expect(generateFor('<input id="field" pattern=".+@.+">', "email", { emailDomain: "acme.test" })).toMatch(/@acme\.test$/);
  });

  it("ignores an invalid pattern", () => {
    expect(generateFor('<input id="field" pattern="[">', "zip", { country: "IN" })).toMatch(/^\d{6}$/);
  });
});

describe("identity settings", () => {
  it("uses a custom first and last name everywhere they appear", () => {
    const profile = createProfile(settingsWith({ firstName: "Dileep", lastName: "Kumar", emailDomain: "sample.com" }));
    expect(profile).toMatchObject({ firstName: "Dileep", lastName: "Kumar", fullName: "Dileep Kumar", email: "dileep.kumar@sample.com" });
    expect(profile.username).toMatch(/^dileep\.kumar\d+$/);
  });

  it("leaves the middle name empty when excluded", () => {
    expect(createProfile(settingsWith({ includeMiddleName: false })).middleName).toBe("");
  });

  it.each([["male", "Male"], ["female", "Female"]] as const)("follows the %s gender setting", (gender, label) => {
    expect(createProfile(settingsWith({ gender })).gender).toBe(label);
  });

  it("picks a gender when set to any", () => {
    expect(["Male", "Female"]).toContain(createProfile(settingsWith()).gender);
  });

  it("makes a random username unrelated to the name", () => {
    const profile = createProfile(settingsWith({ usernameMode: "random", firstName: "Dileep" }));
    expect(profile.username).not.toContain("dileep");
    expect(profile.username).toMatch(/^[a-z0-9]+\d{3}$/);
  });

  it("builds the password from a pattern", () => {
    expect(createProfile(settingsWith({ passwordPattern: "Test@{number:1000-9999}" })).password).toMatch(/^Test@\d{4}$/);
  });

  it("derives the domain and website from a custom company", () => {
    const profile = createProfile(settingsWith({ companyName: "Acme Technologies", domainSuffix: ".io" }));
    expect(profile).toMatchObject({ company: "Acme Technologies", domain: "acmetechnologies.io", website: "https://acmetechnologies.io" });
  });

  it("uses a custom job title and department", () => {
    expect(createProfile(settingsWith({ jobTitle: "QA Lead", department: "Engineering" }))).toMatchObject({ jobTitle: "QA Lead", department: "Engineering" });
  });
});

describe("name region", () => {
  const surnames = (faker: typeof fakerEN_IN): string[] => Object.values(faker.rawDefinitions.person?.last_name ?? {}).flat() as string[];
  const indian = surnames(fakerEN_IN);

  it("uses Indian names and email addresses by default", () => {
    for (const { lastName, email } of sampleProfiles({ nameRegion: "IN", country: "US" })) {
      expect(indian).toContain(lastName);
      expect(email).toContain(lastName.toLowerCase().replace(/[^a-z0-9]/g, ""));
    }
  });

  it("can use another region's names", () => {
    const names = sampleProfiles({ nameRegion: "US" }).map(({ lastName }) => lastName);
    expect(names.some((name) => !indian.includes(name))).toBe(true);
  });

  it("can follow the country", () => {
    for (const { lastName } of sampleProfiles({ nameRegion: "country", country: "IN" })) expect(indian).toContain(lastName);
  });

  it("stays fixed when reusing data", () => {
    const settings = settingsWith({ reuseProfile: true, profileSeed: 9, nameRegion: "IN" });
    expect(createProfile(settings).fullName).toBe(createProfile(settings).fullName);
  });
});

describe("region settings", () => {
  it.each([["IN", "INR"], ["US", "USD"], ["GB", "GBP"], ["CA", "CAD"], ["AU", "AUD"]] as const)("uses %s's currency by default", (country, currency) => {
    expect(createProfile(settingsWith({ country })).currency).toBe(currency);
  });

  it("lets a chosen currency override the country", () => {
    expect(createProfile(settingsWith({ country: "IN", currency: "USD" })).currency).toBe("USD");
  });

  it("follows a country the page selects, unless a currency is chosen", () => {
    const auto = settingsWith({ country: "IN" });
    const profile = createProfile(auto);
    adoptCountry(profile, "Canada", auto);
    expect(profile.currency).toBe("CAD");
  });

  it("adds the country to international addresses only", () => {
    const standard = settingsWith({ addressFormat: "standard" });
    const profile = createProfile(standard);
    expect(generateValue("address", standard, profile)).not.toContain(profile.country);
    expect(generateValue("address", settingsWith({ addressFormat: "international" }), profile)).toMatch(new RegExp(`, ${profile.country}$`));
  });
});

describe("data generation settings", () => {
  const sample = (kind: GeneratedKind, overrides: Partial<AutofillSettings>, html = '<input id="field">'): string[] =>
    Array.from({ length: 100 }, () => generateFor(html, kind, overrides));

  it("keeps numbers inside the configured range", () => {
    for (const value of sample("number", { numberMin: 50, numberMax: 60 })) {
      expect(Number(value)).toBeGreaterThanOrEqual(50);
      expect(Number(value)).toBeLessThanOrEqual(60);
    }
  });

  it("lets a field's own min and max win over the configured range", () => {
    for (const value of sample("number", { numberMin: 50, numberMax: 60 }, '<input id="field" type="number" min="1" max="3">')) {
      expect(Number(value)).toBeLessThanOrEqual(3);
    }
  });

  it("applies decimal precision to text fields", () => {
    expect(generateFor('<input id="field">', "amount", { decimalPrecision: 2 })).toMatch(/^\d+\.\d{2}$/);
  });

  it("applies decimal precision to number fields that allow it", () => {
    expect(generateFor('<input id="field" type="number" step="0.01">', "amount", { decimalPrecision: 4 })).toMatch(/^\d+\.\d{4}$/);
  });

  it("uses whole numbers where the field would reject decimals", () => {
    expect(generateFor('<input id="field" type="number">', "number", { decimalPrecision: 2 })).toMatch(/^\d+$/);
  });

  it("keeps generic dates inside the configured range", () => {
    for (const value of sample("date", { dateStart: "2024-03-01", dateEnd: "2024-03-31" }, '<input id="field" type="date">')) {
      expect(value >= "2024-03-01" && value <= "2024-03-31").toBe(true);
    }
  });

  it("does not let a date range change a date of birth", () => {
    expect(generateFor('<input id="field" type="date">', "dateOfBirth", { ageMin: 30, ageMax: 30, dateStart: "2024-03-01", dateEnd: "2024-03-31" })).not.toMatch(/^2024/);
  });

  it("uses plain random text when asked", () => {
    expect(generateFor('<input id="field">', "text", { textMode: "random" })).toMatch(/^[a-zA-Z]{10}$/);
    expect(generateFor('<input id="field">', "message", { textMode: "random" })).toMatch(/^[a-zA-Z0-9]{24}$/);
  });

  it("keeps company size inside its range", () => {
    expect(createProfile(settingsWith({ companySizeMin: 200, companySizeMax: 200 })).companySize).toBe(200);
  });

  it.each([
    ["employeeId", { employeeIdPattern: "E{number:10-99}" }, /^E\d{2}$/],
    ["customerId", { customerIdPattern: "C{number:10-99}" }, /^C\d{2}$/],
    ["invoiceId", { invoiceIdPattern: "I{number:10-99}" }, /^I\d{2}$/]
  ] as const)("builds %s from its pattern", (kind, overrides, format) => {
    expect(generateValue(kind, settingsWith(overrides), createProfile(settingsWith(overrides)))).toMatch(format);
  });

  it("has sensible default ID patterns", () => {
    expect(createProfile(settingsWith()).employeeId).toMatch(/^EMP-\d{4}$/);
  });
});

describe("repeated fields", () => {
  const settings = settingsWith();
  const profile = createProfile(settings);

  it("leaves the first field as the profile's own value", () => {
    expect(generateValue("email", settings, profile, undefined, 0)).toBe(profile.email);
  });

  it.each(["email", "username", "phone", "employeeId", "customerId", "invoiceId"] as const)("makes repeats of %s different", (kind) => {
    const values = [0, 1, 2].map((repeat) => generateValue(kind, settings, profile, undefined, repeat));
    expect(new Set(values).size).toBe(3);
  });

  it("keeps a repeated phone number the same length", () => {
    expect(generateValue("phone", settings, profile, undefined, 3)).toHaveLength(profile.phone.length);
  });
});

describe("reusing generated data", () => {
  it("gives the same data for the same seed", () => {
    const settings = settingsWith({ reuseProfile: true, profileSeed: 42 });
    const first = createProfile(settings);
    expect(createProfile(settings)).toMatchObject({ fullName: first.fullName, email: first.email, phone: first.phone });
  });

  it("gives different data for a different seed", () => {
    const first = createProfile(settingsWith({ reuseProfile: true, profileSeed: 1 }));
    expect(createProfile(settingsWith({ reuseProfile: true, profileSeed: 2 })).email).not.toBe(first.email);
  });

  it("leaves the rest of the fill random", () => {
    const settings = settingsWith({ reuseProfile: true, profileSeed: 42 });
    createProfile(settings);
    const first = generateValue("text", settings, createProfile(settings));
    createProfile(settings);
    expect(generateValue("text", settings, createProfile(settings))).not.toBe(first);
  });
});

describe("profile tokens", () => {
  it("covers every token rules are allowed to use", () => {
    const tokens = profileTokens(createProfile(settingsWith()));
    expect(Object.keys(tokens)).toEqual([...PROFILE_TOKENS]);
    expect(Object.values(tokens)).not.toContain("undefined");
  });
});

describe("Indian identifiers", () => {
  /** Validates independently of the code that generates the digit. */
  const isVerhoeffValid = (number: string): boolean => verhoeffDigit(number.slice(0, -1)) === number.at(-1);

  it("computes known Verhoeff check digits", () => {
    expect(verhoeffDigit("236")).toBe("3");
    expect(verhoeffDigit("12345")).toBe("1");
  });

  it("generates Aadhaar numbers with the right shape and check digit", () => {
    for (const { aadhaar } of sampleProfiles()) {
      expect(aadhaar).toMatch(/^[2-9]\d{11}$/);
      expect(isVerhoeffValid(aadhaar)).toBe(true);
    }
  });

  it.each<[keyof Profile, RegExp]>([
    ["pan", /^[A-Z]{3}P[A-Z]\d{4}[A-Z]$/],
    ["gstin", /^\d{2}[A-Z]{3}P[A-Z]\d{4}[A-Z]1Z\d$/],
    ["ifsc", /^[A-Z]{4}0\d{6}$/],
    ["upi", /^[a-z0-9.]+@[a-z]+$/],
    ["bankAccount", /^[1-9]\d{11}$/],
    ["passport", /^[A-PR-WY][1-9]\d{6}$/],
    ["voterId", /^[A-Z]{3}\d{7}$/],
    ["drivingLicence", /^[A-Z]{2}\d{2}20\d{2}\d{7}$/]
  ])("generates %s in the right format", (key, format) => {
    for (const profile of sampleProfiles()) expect(profile[key]).toMatch(format);
  });

  it("puts the surname initial in the PAN", () => {
    expect(createProfile(settingsWith({ lastName: "Kumar" })).pan[4]).toBe("K");
  });

  it("copes with a surname that has no leading letter", () => {
    expect(createProfile(settingsWith({ lastName: "9Lives" })).pan).toMatch(/^[A-Z]{3}P[A-Z]\d{4}[A-Z]$/);
  });

  it("follows a spaced Aadhaar format the page asks for", () => {
    expect(generateFor('<div><input id="field"><p>Format: XXXX XXXX XXXX</p></div>', "aadhaar")).toMatch(/^\d{4} \d{4} \d{4}$/);
  });

  it("fits an Aadhaar number into a number input", () => {
    expect(generateFor('<input id="field" type="number">', "aadhaar")).toMatch(/^[2-9]\d{11}$/);
  });
});

describe("format hints on the page", () => {
  const hinted = (hint: string, kind: GeneratedKind = "taxId", overrides: Partial<AutofillSettings> = { country: "IN" }): string =>
    generateFor(`<div><label for="field">Federal Tax ID</label><input id="field"><p>${hint}</p></div>`, kind, overrides);

  it("follows a mask written under the field", () => {
    expect(hinted("Format: XX-XXXXXXX")).toMatch(/^\d{2}-\d{7}$/);
  });

  it("follows an example", () => {
    expect(hinted("e.g. AB-1234")).toMatch(/^[A-Z]{2}-\d{4}$/);
  });

  it("follows a mask in the placeholder", () => {
    expect(generateFor('<input id="field" placeholder="###-##-####">', "taxId")).toMatch(/^\d{3}-\d{2}-\d{4}$/);
  });

  it("follows a hint linked with aria-describedby", () => {
    expect(generateFor('<input id="field" aria-describedby="h"><p id="h">Format: 99-9999</p>', "zip")).toMatch(/^\d{2}-\d{4}$/);
  });

  it("leaves a value that already fits", () => {
    render('<div><input id="field"><p>Format: XX-XXXXXXX</p></div>');
    const settings = settingsWith({ country: "US" });
    const profile = createProfile(settings);
    expect(generateValue("taxId", settings, profile, find<HTMLInputElement>("#field"))).toBe(profile.taxId);
  });

  it("gives two fields with the same hint the same value", () => {
    render('<div><input id="a"><p>Format: XX-XXXXXXX</p></div><div><input id="b"><p>Format: XX-XXXXXXX</p></div>');
    const settings = settingsWith();
    const profile = createProfile(settings);
    expect(generateValue("taxId", settings, profile, find<HTMLInputElement>("#a"))).toBe(generateValue("taxId", settings, profile, find<HTMLInputElement>("#b")));
  });

  it("does not take a neighbouring field's hint", () => {
    render('<div><input id="field"><input id="other"><p>Format: XX-XXXXXXX</p></div>');
    const settings = settingsWith({ country: "IN" });
    const profile = createProfile(settings);
    expect(generateValue("taxId", settings, profile, find<HTMLInputElement>("#field"))).toBe(profile.taxId);
  });

  it("does not apply hints to fields that have their own shape", () => {
    expect(hinted("Format: XX-XXXXXXX", "email", { emailDomain: "sample.com" })).toContain("@sample.com");
  });
});

describe("constrained identifiers", () => {
  const india = { country: "IN" } as const;

  it("shortens a phone to its local digits for maxlength", () => {
    expect(generateFor('<input id="field" maxlength="10">', "phone", india)).toMatch(/^9\d{9}$/);
  });

  it("drops the country code first when maxlength is tight", () => {
    expect(generateFor('<input id="field" maxlength="10">', "phone", { ...india, phoneFormat: "international" })).toMatch(/^9\d{9}$/);
  });

  it("keeps the real number when a pattern wants digits", () => {
    render('<input id="a" pattern="[0-9]{10}"><input id="b" maxlength="10">');
    const settings = settingsWith({ country: "GB" });
    const profile = createProfile(settings);
    expect(generateValue("phone", settings, profile, find<HTMLInputElement>("#a")))
      .toBe(generateValue("phone", settings, profile, find<HTMLInputElement>("#b")));
  });

  it("gives a number input digits instead of a value it would discard", () => {
    expect(generateFor('<input id="field" type="number">', "phone", india)).toMatch(/^9\d{9}$/);
  });

  it("gives a number input a number even when the value has no digits", () => {
    expect(generateFor('<input id="field" type="number">', "text")).toMatch(/^\d+$/);
  });

  it("removes separators from a tax ID before shortening it", () => {
    expect(generateFor('<input id="field" maxlength="11">', "taxId", { country: "AU" })).toMatch(/^\d{11}$/);
  });

  it("still cuts ordinary text at maxlength", () => {
    expect(generateFor('<input id="field" maxlength="4">', "company")).toHaveLength(4);
  });

  it("builds an Indian GSTIN around the PAN", () => {
    const { gstin, taxId } = createProfile(settingsWith(india));
    expect(gstin).toMatch(/^\d{2}[A-Z]{3}P[A-Z]\d{4}[A-Z]1Z\d$/);
    expect(gstin).toContain(taxId);
  });

  it("keeps Indian formats for Indian fields on a form for another country", () => {
    const { gstin, pan, taxId } = createProfile(settingsWith({ country: "GB" }));
    expect(pan).toMatch(/^[A-Z]{3}P[A-Z]\d{4}[A-Z]$/);
    expect(gstin).toContain(pan);
    expect(taxId).toMatch(/^GB\d{9}$/);
  });
});

describe("passwords", () => {
  it("meets common strength rules", () => {
    for (const { password } of sampleProfiles()) {
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[^A-Za-z0-9]/);
      expect(password.length).toBeGreaterThanOrEqual(12);
    }
  });

  it("reaches a field's minlength", () => {
    expect(generateFor('<input id="field" minlength="24">', "password")).toHaveLength(24);
  });

  it("stays identical across fields that share a pattern", () => {
    render('<input id="a" pattern="[0-9]{8}"><input id="b" pattern="[0-9]{8}">');
    const settings = settingsWith();
    const profile = createProfile(settings);
    const first = generateValue("password", settings, profile, find<HTMLInputElement>("#a"));
    expect(first).toMatch(/^[0-9]{8}$/);
    expect(generateValue("password", settings, profile, find<HTMLInputElement>("#b"))).toBe(first);
  });
});

describe("date candidates", () => {
  const date = new Date(1990, 4, 23);

  it("offers the placeholder format, then the saved one, then common ones, without repeats", () => {
    render('<input id="field" placeholder="dd.mm.yyyy">');
    expect(dateCandidates(date, settingsWith({ dateFormat: "YYYY-MM-DD" }), find<HTMLInputElement>("#field")))
      .toEqual(["23.05.1990", "1990-05-23", "05/23/1990", "23/05/1990"]);
  });

  it("ignores a placeholder that is not a date format", () => {
    render('<input id="field" placeholder="Select date">');
    expect(dateCandidates(date, settingsWith(), find<HTMLInputElement>("#field"))[0]).toBe("1990-05-23");
  });
});

describe("customRuleValue", () => {
  const profile = createProfile(settingsWith());
  const withRules = (match: string, value: string) => settingsWith({ customRules: [{ match, value }] });

  it("returns the value of a matching rule", () => {
    expect(customRuleValue("employee id", withRules("employee id", "EMP-1"), profile)).toBe("EMP-1");
  });

  it("normalises the keyword the same way as the field", () => {
    expect(customRuleValue("employee id", withRules("employeeId", "EMP-1"), profile)).toBe("EMP-1");
  });

  it("matches whole words only", () => {
    expect(customRuleValue("stage", withRules("age", "1"), profile)).toBeUndefined();
  });

  it("matches regardless of case", () => {
    expect(customRuleValue("employee id", withRules("EMPLOYEE ID", "EMP-1"), profile)).toBe("EMP-1");
  });

  it("generates numbers from a pattern", () => {
    expect(customRuleValue("invoice id", withRules("invoice id", "INV-{number:10000-99999}"), profile)).toMatch(/^INV-\d{5}$/);
  });

  it("fills tokens from the profile and leaves unknown ones alone", () => {
    expect(customRuleValue("alias", withRules("alias", "{firstName}-{nope}"), profile)).toBe(`${profile.firstName}-{nope}`);
  });
});

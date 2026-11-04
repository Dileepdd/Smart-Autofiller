import { faker } from "@faker-js/faker";
import { AutofillSettings } from "../shared/types";
import { City, findCity, findLocale, findRegion, Locale, localeByCode, Region } from "./locales";

/** Everything one fill writes, created up front so related fields agree with each other. */
export interface Profile {
  firstName: string;
  middleName: string;
  lastName: string;
  fullName: string;
  email: string;
  username: string;
  password: string;
  jobTitle: string;
  age: number;
  dateOfBirth: Date;
  experience: number;
  company: string;
  domain: string;
  website: string;
  phone: string;
  taxId: string;
  gstin: string;
  street: string;
  addressLine2: string;
  city: string;
  region: string;
  regionCode: string;
  postalCode: string;
  country: string;
  countryCode: string;
}

/** Earliest age at which experience starts counting. */
const WORKING_AGE = 18;

export const pickInt = (min: number, max: number): number =>
  faker.number.int({ min: Math.min(min, max), max: Math.max(min, max) });

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const cleanDomainPart = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 32) || "example";

const normalizeSuffix = (suffix: string): string => (suffix.startsWith(".") ? suffix : `.${suffix}`);

function formatPhone(locale: Locale, format: AutofillSettings["phoneFormat"]): string {
  const national = faker.helpers.replaceSymbols(locale.phone);
  if (format === "national") return national;
  return `${locale.dialCode} ${national.replace(/^0/, "").replace(/[()]/g, "").replace(/-/g, " ")}`;
}

/** Picks age and experience together, so nobody has more experience than working years. */
function pickCareer(settings: AutofillSettings): { age: number; experience: number } {
  const ageMin = Math.min(settings.ageMin, settings.ageMax);
  const ageMax = Math.max(settings.ageMin, settings.ageMax);
  const experienceMin = Math.min(settings.experienceMin, settings.experienceMax);
  const experienceMax = Math.max(settings.experienceMin, settings.experienceMax);

  const age = pickInt(clamp(experienceMin + WORKING_AGE, ageMin, ageMax), ageMax);
  // The configured minimum wins when the configured ranges cannot both hold.
  const experience = pickInt(experienceMin, clamp(age - WORKING_AGE, experienceMin, experienceMax));
  return { age, experience };
}

function birthDateFor(age: number): Date {
  const now = new Date();
  const latest = new Date(now.getFullYear() - age, now.getMonth(), now.getDate());
  const earliest = new Date(now.getFullYear() - age - 1, now.getMonth(), now.getDate() + 1);
  return faker.date.between({ from: earliest, to: latest });
}

function setCity(profile: Profile, region: Region, city: City): void {
  profile.region = region.name;
  profile.regionCode = region.code;
  profile.city = city.name;
  profile.postalCode = city.postalCode;
}

function setLocale(profile: Profile, locale: Locale, settings: AutofillSettings): void {
  const region = faker.helpers.arrayElement(locale.regions);
  profile.country = locale.name;
  profile.countryCode = locale.code;
  profile.phone = formatPhone(locale, settings.phoneFormat);
  profile.taxId = faker.helpers.replaceSymbols(locale.taxId);
  // A GSTIN wraps the holder's PAN. Other countries have no equivalent, so they use their tax ID.
  profile.gstin = locale.code === "IN" ? `${pickInt(10, 37)}${profile.taxId}1Z${pickInt(0, 9)}` : profile.taxId;
  setCity(profile, region, faker.helpers.arrayElement(region.cities));
}

export function createProfile(settings: AutofillSettings): Profile {
  const firstName = faker.person.firstName();
  const middleName = faker.person.middleName();
  const lastName = faker.person.lastName();
  const company = faker.company.name().replace(/[,.]/g, "");
  const emailDomain = settings.emailDomain.replace(/^@/, "").trim() || "example.com";
  const localPart = `${cleanDomainPart(firstName)}.${cleanDomainPart(lastName)}`;
  const domain = `${cleanDomainPart(company)}${normalizeSuffix(settings.domainSuffix)}`;
  const { age, experience } = pickCareer(settings);

  const profile: Profile = {
    firstName,
    middleName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    email: `${localPart}@${emailDomain}`,
    username: `${localPart}${pickInt(10, 99)}`,
    // The fixed prefix meets the upper, lower, digit and symbol rules most sign-up forms enforce.
    password: `Aa1!${faker.string.alphanumeric(12)}`,
    jobTitle: faker.person.jobTitle(),
    age,
    dateOfBirth: birthDateFor(age),
    experience,
    company,
    domain,
    website: `https://${domain}`,
    phone: "",
    taxId: "",
    gstin: "",
    street: faker.location.streetAddress(),
    addressLine2: faker.location.secondaryAddress(),
    city: "",
    region: "",
    regionCode: "",
    postalCode: "",
    country: "",
    countryCode: ""
  };
  setLocale(profile, localeByCode(settings.country), settings);
  return profile;
}

/** Re-derives the location after the page offered a different country, so later fields still match it. */
export function adoptCountry(profile: Profile, label: string, settings: AutofillSettings): void {
  const locale = findLocale(label);
  if (!locale) profile.country = label;
  else if (locale.code !== profile.countryCode) setLocale(profile, locale, settings);
}

export function adoptRegion(profile: Profile, label: string): void {
  const locale = findLocale(profile.countryCode);
  const region = locale && findRegion(locale, label);
  if (!region) profile.region = label;
  else if (region.name !== profile.region) setCity(profile, region, faker.helpers.arrayElement(region.cities));
}

export function adoptCity(profile: Profile, label: string): void {
  const locale = findLocale(profile.countryCode);
  const match = locale && findCity(locale, label);
  if (match) setCity(profile, match.region, match.city);
  else profile.city = label;
}

/** Option labels or values that would match this profile, best first. */
export function dropdownTargets(kind: string, profile: Profile): string[] {
  const locale = findLocale(profile.countryCode);
  if (kind === "country") return [profile.country, profile.countryCode, ...(locale?.aliases ?? []), locale?.dialCode ?? ""].filter(Boolean);
  if (kind === "state") return [profile.region, profile.regionCode];
  if (kind === "city") return [profile.city];
  if (kind === "age") return [String(profile.age)];
  if (kind === "experience") return [String(profile.experience)];
  return [];
}

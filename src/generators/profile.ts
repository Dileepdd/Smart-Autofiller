import { base, en, Faker, faker, fakerEN_AU, fakerEN_CA, fakerEN_GB, fakerEN_IN, fakerEN_US } from "@faker-js/faker";
import { foldAccents } from "../shared/text";
import { PROFILE_TOKENS, renderTemplate } from "../shared/template";
import { AutofillSettings, CountryCode } from "../shared/types";
import { createIndianIdentifiers, IndianIdentifiers } from "./identifiers";
import { registeredLocale } from "./localeRegistry";
import { City, findCity, findLocale, findRegion, Locale, localeByCode, Region } from "./locales";

/** Everything one fill writes, created up front so related fields agree with each other. */
export interface Profile extends IndianIdentifiers {
  firstName: string;
  middleName: string;
  lastName: string;
  fullName: string;
  gender: string;
  email: string;
  username: string;
  password: string;
  jobTitle: string;
  department: string;
  age: number;
  dateOfBirth: Date;
  experience: number;
  company: string;
  companySize: number;
  domain: string;
  website: string;
  phone: string;
  taxId: string;
  street: string;
  addressLine2: string;
  city: string;
  region: string;
  regionCode: string;
  postalCode: string;
  country: string;
  countryCode: string;
  currency: string;
  employeeId: string;
  customerId: string;
  invoiceId: string;
}

const NAME_SOURCES: Partial<Record<CountryCode, Faker>> = { IN: fakerEN_IN, US: fakerEN_US, GB: fakerEN_GB, CA: fakerEN_CA, AU: fakerEN_AU };
const loadedSources = new Map<CountryCode, Faker>();

/** A country whose data file was not loaded gets English names, while its addresses still come from its own table. */
function sourceFor(code: CountryCode): { names: Faker; local: boolean } {
  const bundled = NAME_SOURCES[code];
  if (bundled) return { names: bundled, local: false };
  const loaded = loadedSources.get(code);
  if (loaded) return { names: loaded, local: true };
  const definition = registeredLocale(code);
  if (!definition) return { names: fakerEN_US, local: false };
  const names = new Faker({ locale: [definition, en, base] });
  loadedSources.set(code, names);
  return { names, local: true };
}

const nameCountry = (settings: AutofillSettings): CountryCode =>
  settings.nameRegion === "country" ? settings.country : settings.nameRegion;

const nameSource = (settings: AutofillSettings): Faker => sourceFor(nameCountry(settings)).names;

/** Earliest age at which experience starts counting. */
const WORKING_AGE = 18;

export const pickInt = (min: number, max: number): number =>
  faker.number.int({ min: Math.min(min, max), max: Math.max(min, max) });

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

/** Email addresses and domains stay plain ASCII: "Müller" becomes "muller", not "mller". */
const cleanDomainPart = (value: string): string =>
  foldAccents(value.toLowerCase()).replace(/[^a-z0-9]+/g, "").slice(0, 32) || "example";

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
  profile.currency = settings.currency === "auto" ? locale.currency : settings.currency;
  profile.phone = formatPhone(locale, settings.phoneFormat);
  profile.taxId = locale.code === "IN" ? profile.pan : faker.helpers.replaceSymbols(locale.taxId);
  setCity(profile, region, faker.helpers.arrayElement(region.cities));
}

/** A profile's values as text, for use as {token} in templates. */
export function profileTokens(profile: Profile): Record<string, string> {
  return Object.fromEntries(PROFILE_TOKENS.map((name) => {
    const value = profile[name];
    return [name, value instanceof Date ? value.toLocaleDateString("en-CA") : String(value)];
  }));
}

export const renderProfileTemplate = (template: string, profile: Profile): string =>
  renderTemplate(template, profileTokens(profile), pickInt);

function generateProfile(settings: AutofillSettings): Profile {
  const sex = settings.gender === "any" ? faker.helpers.arrayElement(["male", "female"] as const) : settings.gender;
  const names = nameSource(settings);
  const firstName = settings.firstName || names.person.firstName(sex);
  const middleName = settings.includeMiddleName ? names.person.middleName(sex) : "";
  // Faker sometimes joins two surnames with a hyphen, which reads as generated data.
  const lastName = settings.lastName || names.person.lastName().split("-")[0];
  const company = settings.companyName || names.company.name().replace(/[,.]/g, "");
  const emailDomain = settings.emailDomain.replace(/^@/, "").trim() || "example.com";
  const localPart = `${cleanDomainPart(firstName)}.${cleanDomainPart(lastName)}`;
  const domain = `${cleanDomainPart(company)}${normalizeSuffix(settings.domainSuffix)}`;
  const { age, experience } = pickCareer(settings);

  const profile: Profile = {
    ...createIndianIdentifiers(lastName, localPart),
    firstName,
    middleName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    gender: sex === "male" ? "Male" : "Female",
    email: `${localPart}@${emailDomain}`,
    username: settings.usernameMode === "name" ? `${localPart}${pickInt(10, 99)}` : `${cleanDomainPart(faker.word.noun())}${pickInt(100, 999)}`,
    // The fixed prefix meets the upper, lower, digit and symbol rules most sign-up forms enforce.
    password: `Aa1!${faker.string.alphanumeric(12)}`,
    jobTitle: settings.jobTitle || faker.person.jobTitle(),
    department: settings.department || faker.commerce.department(),
    age,
    dateOfBirth: birthDateFor(age),
    experience,
    company,
    companySize: pickInt(settings.companySizeMin, settings.companySizeMax),
    domain,
    website: `https://${domain}`,
    phone: "",
    taxId: "",
    // A country loaded from its own file has local street names, such as "Hauptstraße 12".
    street: (sourceFor(settings.country).local ? sourceFor(settings.country).names : faker).location.streetAddress(),
    addressLine2: faker.location.secondaryAddress(),
    city: "",
    region: "",
    regionCode: "",
    postalCode: "",
    country: "",
    countryCode: "",
    currency: "",
    employeeId: "",
    customerId: "",
    invoiceId: ""
  };
  setLocale(profile, localeByCode(settings.country), settings);
  profile.employeeId = renderProfileTemplate(settings.employeeIdPattern, profile);
  profile.customerId = renderProfileTemplate(settings.customerIdPattern, profile);
  profile.invoiceId = renderProfileTemplate(settings.invoiceIdPattern, profile);
  if (settings.passwordPattern) profile.password = renderProfileTemplate(settings.passwordPattern, profile);
  return profile;
}

export function createProfile(settings: AutofillSettings): Profile {
  if (!settings.reuseProfile) return generateProfile(settings);
  const names = nameSource(settings);
  faker.seed(settings.profileSeed);
  names.seed(settings.profileSeed);
  const profile = generateProfile(settings);
  // Everything else in the fill stays random.
  faker.seed();
  names.seed();
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
  const match = locale && findCity(locale, label, profile.region);
  if (match) setCity(profile, match.region, match.city);
  else profile.city = label;
}

/** Takes names a dataset supplies, so a generated email still matches them. */
export function adoptNames(profile: Profile, names: { firstName?: string; lastName?: string; fullName?: string }, settings: AutofillSettings): void {
  const [first, ...rest] = (names.fullName ?? "").trim().split(/\s+/);
  profile.firstName = names.firstName?.trim() || first || profile.firstName;
  profile.lastName = names.lastName?.trim() || (rest.length ? rest.join(" ") : profile.lastName);
  profile.fullName = names.fullName?.trim() || `${profile.firstName} ${profile.lastName}`;
  const domain = settings.emailDomain.replace(/^@/, "").trim() || "example.com";
  profile.email = `${cleanDomainPart(profile.firstName)}.${cleanDomainPart(profile.lastName)}@${domain}`;
}

/**
 * How gender and salutation options are written in the languages whose labels are recognised.
 * Full words come before short ones, and the single letter last, so "Female" never matches "Male".
 */
const GENDER_OPTIONS: Readonly<Record<"male" | "female", readonly string[]>> = {
  male: ["Male", "Mr", "Mr.", "Männlich", "Mann", "Herr", "Masculin", "Homme", "Monsieur", "M.", "Masculino", "Hombre", "Señor", "Sr.", "Maschile", "Maschio", "Uomo", "Sig.", "Mannelijk", "Dhr.", "De heer", "पुरुष", "Man"],
  female: ["Female", "Mrs", "Ms", "Mrs.", "Ms.", "Weiblich", "Frau", "Féminin", "Femme", "Madame", "Mme", "Femenino", "Mujer", "Señora", "Sra.", "Feminino", "Mulher", "Femminile", "Femmina", "Donna", "Sig.ra", "Vrouwelijk", "Vrouw", "Mevr.", "महिला", "स्त्री", "Woman"]
};

/** Option labels or values that would match this profile, best first. */
export function dropdownTargets(kind: string, profile: Profile): string[] {
  const locale = findLocale(profile.countryCode);
  if (kind === "country") return [profile.country, profile.countryCode, ...(locale?.aliases ?? []), locale?.dialCode ?? ""].filter(Boolean);
  if (kind === "state") return [profile.region, profile.regionCode];
  if (kind === "city") return [profile.city];
  if (kind === "age") return [String(profile.age)];
  if (kind === "experience") return [String(profile.experience)];
  if (kind === "companySize") return [String(profile.companySize)];
  if (kind === "gender") return [...GENDER_OPTIONS[profile.gender === "Male" ? "male" : "female"], profile.gender[0]];
  if (kind === "currency") return [profile.currency];
  if (kind === "department") return [profile.department];
  if (kind === "jobTitle") return [profile.jobTitle];
  return [];
}

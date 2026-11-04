import { faker } from "@faker-js/faker";
import { FieldKind } from "../content/classifier";
import { splitWords } from "../content/context";
import { AutofillSettings } from "../shared/types";
import { pickInt, Profile } from "./profile";

export type GeneratedKind = Exclude<FieldKind, "skip">;

type TextField = HTMLInputElement | HTMLTextAreaElement;

interface GeneratorContext {
  settings: AutofillSettings;
  profile: Profile;
  element?: TextField;
}

const pad = (value: number): string => String(value).padStart(2, "0");

const formatDate = (date: Date, format: string): string =>
  format.replace(/y+|m+|d+/gi, (part) => {
    const token = part[0].toLowerCase();
    if (token === "y") return String(date.getFullYear());
    return pad(token === "m" ? date.getMonth() + 1 : date.getDate());
  });

const isDateInput = (element?: TextField): boolean => element?.getAttribute("type")?.toLowerCase() === "date";

const placeholderFormat = (element?: TextField): string | undefined => {
  const placeholder = element?.getAttribute("placeholder")?.trim() ?? "";
  return /^[dmy]+[/\-. ][dmy]+[/\-. ][dmy]+$/i.test(placeholder) ? placeholder : undefined;
};

/** Date inputs require ISO; text fields follow their own placeholder, then the saved format. */
function dateValue(date: Date, { settings, element }: GeneratorContext): string {
  if (isDateInput(element)) return formatDate(date, "YYYY-MM-DD");
  return formatDate(date, placeholderFormat(element) ?? settings.dateFormat);
}

export const isDateKind = (kind: string): kind is "dateOfBirth" | "date" | "futureDate" =>
  kind === "dateOfBirth" || kind === "date" || kind === "futureDate";

export function pickDate(kind: "dateOfBirth" | "date" | "futureDate", profile: Profile): Date {
  if (kind === "dateOfBirth") return profile.dateOfBirth;
  return kind === "date" ? faker.date.recent({ days: 365 }) : faker.date.soon({ days: 365 });
}

/** Formats to offer a date picker, most likely first. Pickers rarely announce the one they expect. */
export function dateCandidates(date: Date, settings: AutofillSettings, element: TextField): string[] {
  const formats = [placeholderFormat(element), settings.dateFormat, "YYYY-MM-DD", "MM/DD/YYYY", "DD/MM/YYYY"];
  return [...new Set(formats.flatMap((format) => (format ? formatDate(date, format) : [])))];
}

function numberValue({ element }: GeneratorContext): string {
  const attribute = (name: string): number | undefined => {
    const value = element?.getAttribute(name);
    return value && Number.isFinite(Number(value)) ? Number(value) : undefined;
  };
  const min = attribute("min") ?? 1;
  return String(pickInt(min, attribute("max") ?? Math.max(100, min + 100)));
}

// Typed as a full Record so that adding a FieldKind fails to compile until it has a generator.
const GENERATORS: Record<GeneratedKind, (context: GeneratorContext) => string> = {
  firstName: ({ profile }) => profile.firstName,
  middleName: ({ profile }) => profile.middleName,
  lastName: ({ profile }) => profile.lastName,
  fullName: ({ profile }) => profile.fullName,
  email: ({ profile }) => profile.email,
  username: ({ profile }) => profile.username,
  password: ({ profile }) => profile.password,
  phone: ({ profile }) => profile.phone,
  company: ({ profile }) => profile.company,
  jobTitle: ({ profile }) => profile.jobTitle,
  domain: ({ profile }) => profile.domain,
  website: ({ profile }) => profile.website,
  url: ({ profile }) => profile.website,
  age: ({ profile }) => String(profile.age),
  experience: ({ profile }) => String(profile.experience),
  taxId: ({ profile }) => profile.taxId,
  gstin: ({ profile }) => profile.gstin,
  zip: ({ profile }) => profile.postalCode,
  street: ({ profile }) => profile.street,
  addressLine2: ({ profile }) => profile.addressLine2,
  address: ({ profile }) => `${profile.street}, ${profile.city}, ${profile.region} ${profile.postalCode}`,
  city: ({ profile }) => profile.city,
  state: ({ profile }) => profile.region,
  country: ({ profile }) => profile.country,
  dateOfBirth: (context) => dateValue(pickDate("dateOfBirth", context.profile), context),
  date: (context) => dateValue(pickDate("date", context.profile), context),
  futureDate: (context) => dateValue(pickDate("futureDate", context.profile), context),
  dateTime: () => `${formatDate(faker.date.soon({ days: 30 }), "YYYY-MM-DD")}T${pad(pickInt(9, 17))}:00`,
  time: () => `${pad(pickInt(9, 17))}:00`,
  month: () => formatDate(faker.date.soon({ days: 365 }), "YYYY-MM"),
  week: () => `${new Date().getFullYear()}-W${pad(pickInt(1, 52))}`,
  number: numberValue,
  message: () => faker.company.catchPhrase(),
  text: () => faker.word.words(2)
};

function matchesPattern(value: string, pattern: string): boolean {
  try {
    return new RegExp(`^(?:${pattern})$`).test(value);
  } catch {
    return true;
  }
}

/** Remembers replacements per profile so that a password and its confirmation stay identical. */
const patternValues = new WeakMap<Profile, Map<string, string>>();

const digitsOf = (value: string): string => value.replace(/\D/g, "");

/** The same value without formatting. Phones also drop leading digits, which may be a country code or trunk zero. */
function plainForms(value: string, kind: GeneratedKind): string[] {
  const digits = digitsOf(value);
  const forms = [value.replace(/[\s()-]/g, ""), digits];
  if (kind === "phone") forms.push(...[1, 2, 3].map((dropped) => digits.slice(dropped)));
  return forms;
}

function fitPattern(value: string, pattern: string, kind: GeneratedKind, profile: Profile): string {
  const plain = [value, ...plainForms(value, kind)].find((form) => form && matchesPattern(form, pattern));
  if (plain) return plain;
  const known = patternValues.get(profile) ?? new Map<string, string>();
  patternValues.set(profile, known);
  const key = `${pattern}\n${value}`;
  try {
    const candidate = known.get(key) ?? faker.helpers.fromRegExp(pattern);
    if (!matchesPattern(candidate, pattern)) return value;
    known.set(key, candidate);
    return candidate;
  } catch {
    return value;
  }
}

function fitLength(value: string, kind: GeneratedKind, maxLength: number): string {
  if (value.length <= maxLength) return value;
  // The end of a phone number is the subscriber's, so its country code goes first.
  if (kind === "phone") return digitsOf(value).slice(-maxLength);
  const identifier = kind === "taxId" || kind === "gstin" || kind === "zip";
  return (identifier ? value.replace(/[\s-]/g, "") : value).slice(0, maxLength);
}

/** Keeps a generated value inside the limits the field itself declares. */
function fitConstraints(value: string, kind: GeneratedKind, element: TextField, profile: Profile): string {
  const type = element.getAttribute("type")?.toLowerCase();
  const min = element.getAttribute("min");
  const max = element.getAttribute("max");

  if (type === "number") {
    const number = Number(value);
    // A number input discards formatted values such as phone numbers outright.
    if (!Number.isFinite(number)) return digitsOf(value) || String(pickInt(1000, 9999));
    const atLeast = min && Number.isFinite(Number(min)) ? Math.max(number, Number(min)) : number;
    return String(max && Number.isFinite(Number(max)) ? Math.min(atLeast, Number(max)) : atLeast);
  }
  if (type === "date") {
    if (min && value < min) return min;
    return max && value > max ? max : value;
  }

  const pattern = element.getAttribute("pattern");
  const fitted = pattern ? fitPattern(value, pattern, kind, profile) : value;
  const padded = fitted.padEnd(Number(element.getAttribute("minlength")) || 0, "x");
  const maxLength = Number(element.getAttribute("maxlength"));
  return maxLength > 0 ? fitLength(padded, kind, maxLength) : padded;
}

export function generateValue(kind: GeneratedKind, settings: AutofillSettings, profile: Profile, element?: TextField): string {
  const value = GENERATORS[kind]({ settings, profile, element });
  return element ? fitConstraints(value, kind, element, profile) : value;
}

function interpolate(template: string, profile: Profile): string {
  return template.replace(/\{(\w+)\}/g, (token, name: string) => {
    if (!(name in profile)) return token;
    const value = profile[name as keyof Profile];
    return value instanceof Date ? formatDate(value, "YYYY-MM-DD") : String(value);
  });
}

/** Returns the value of the first custom rule whose keyword appears in the field's description. */
export function customRuleValue(description: string, settings: AutofillSettings, profile: Profile): string | undefined {
  const rule = settings.customRules.find(({ match }) => ` ${description} `.includes(` ${splitWords(match)} `));
  return rule && interpolate(rule.value, profile);
}

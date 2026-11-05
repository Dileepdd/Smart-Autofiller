import { faker } from "@faker-js/faker";
import { FieldKind } from "../content/classifier";
import { formatHint, splitWords } from "../content/context";
import { AutofillSettings } from "../shared/types";
import { pickInt, Profile, renderProfileTemplate } from "./profile";

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

const DAY_MS = 86_400_000;

const localDate = (iso: string): Date => {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export function pickDate(kind: "dateOfBirth" | "date" | "futureDate", profile: Profile, settings: AutofillSettings): Date {
  if (kind === "dateOfBirth") return profile.dateOfBirth;
  if (settings.dateStart || settings.dateEnd) {
    const from = settings.dateStart ? localDate(settings.dateStart) : new Date(localDate(settings.dateEnd).getTime() - 365 * DAY_MS);
    const to = settings.dateEnd ? localDate(settings.dateEnd) : new Date(from.getTime() + 365 * DAY_MS);
    return faker.date.between({ from, to });
  }
  return kind === "date" ? faker.date.recent({ days: 365 }) : faker.date.soon({ days: 365 });
}

/** Formats to offer a date picker, most likely first. Pickers rarely announce the one they expect. */
export function dateCandidates(date: Date, settings: AutofillSettings, element: TextField): string[] {
  const formats = [placeholderFormat(element), settings.dateFormat, "YYYY-MM-DD", "MM/DD/YYYY", "DD/MM/YYYY"];
  return [...new Set(formats.flatMap((format) => (format ? formatDate(date, format) : [])))];
}

/** A number input with no decimal step rejects fractions, so precision only applies where they are legal. */
function allowsDecimals(element?: TextField): boolean {
  if (element?.getAttribute("type")?.toLowerCase() !== "number") return true;
  const step = element.getAttribute("step");
  return step === "any" || (step ?? "").includes(".");
}

function numberValue({ settings, element }: GeneratorContext): string {
  const attribute = (name: string): number | undefined => {
    const value = element?.getAttribute(name);
    return value && Number.isFinite(Number(value)) ? Number(value) : undefined;
  };
  const min = attribute("min") ?? settings.numberMin;
  const fallbackMax = attribute("min") === undefined ? settings.numberMax : Math.max(settings.numberMax, min + 100);
  const max = attribute("max") ?? fallbackMax;
  if (settings.decimalPrecision === 0 || !allowsDecimals(element)) return String(pickInt(min, max));
  return faker.number.float({ min: Math.min(min, max), max: Math.max(min, max), fractionDigits: settings.decimalPrecision }).toFixed(settings.decimalPrecision);
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
  department: ({ profile }) => profile.department,
  gender: ({ profile }) => profile.gender,
  companySize: ({ profile }) => String(profile.companySize),
  employeeId: ({ profile }) => profile.employeeId,
  customerId: ({ profile }) => profile.customerId,
  invoiceId: ({ profile }) => profile.invoiceId,
  currency: ({ profile }) => profile.currency,
  domain: ({ profile }) => profile.domain,
  website: ({ profile }) => profile.website,
  url: ({ profile }) => profile.website,
  age: ({ profile }) => String(profile.age),
  experience: ({ profile }) => String(profile.experience),
  taxId: ({ profile }) => profile.taxId,
  gstin: ({ profile }) => profile.gstin,
  aadhaar: ({ profile }) => profile.aadhaar,
  pan: ({ profile }) => profile.pan,
  ifsc: ({ profile }) => profile.ifsc,
  upi: ({ profile }) => profile.upi,
  bankAccount: ({ profile }) => profile.bankAccount,
  passport: ({ profile }) => profile.passport,
  voterId: ({ profile }) => profile.voterId,
  drivingLicence: ({ profile }) => profile.drivingLicence,
  zip: ({ profile }) => profile.postalCode,
  street: ({ profile }) => profile.street,
  addressLine2: ({ profile }) => profile.addressLine2,
  address: ({ profile, settings }) => {
    const local = `${profile.street}, ${profile.city}, ${profile.region} ${profile.postalCode}`;
    return settings.addressFormat === "international" ? `${local}, ${profile.country}` : local;
  },
  city: ({ profile }) => profile.city,
  state: ({ profile }) => profile.region,
  country: ({ profile }) => profile.country,
  dateOfBirth: (context) => dateValue(pickDate("dateOfBirth", context.profile, context.settings), context),
  date: (context) => dateValue(pickDate("date", context.profile, context.settings), context),
  futureDate: (context) => dateValue(pickDate("futureDate", context.profile, context.settings), context),
  dateTime: () => `${formatDate(faker.date.soon({ days: 30 }), "YYYY-MM-DD")}T${pad(pickInt(9, 17))}:00`,
  time: () => `${pad(pickInt(9, 17))}:00`,
  month: () => formatDate(faker.date.soon({ days: 365 }), "YYYY-MM"),
  week: () => `${new Date().getFullYear()}-W${pad(pickInt(1, 52))}`,
  number: numberValue,
  amount: numberValue,
  message: ({ settings }) => (settings.textMode === "random" ? faker.string.alphanumeric(24) : faker.company.catchPhrase()),
  text: ({ settings }) => (settings.textMode === "random" ? faker.string.alpha(10) : faker.word.words(2))
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

const HINTED_KINDS: readonly GeneratedKind[] = ["taxId", "aadhaar", "bankAccount", "phone", "zip", "employeeId", "customerId", "invoiceId", "text"];

/** Letters become A and digits 9. In a mask, X and # stand for digits, as in XX-XXXXXXX. */
const shapeOf = (text: string): string => text.replace(/\d/g, "9").replace(/[a-z]/gi, "A");
const maskShape = (mask: string): string => shapeOf(mask.replace(/[x#]/gi, "9"));

/** Rewrites a value into the format the page asks for, reusing its characters so repeats stay equal. */
function fitFormat(value: string, kind: GeneratedKind, element: TextField): string {
  const mask = HINTED_KINDS.includes(kind) ? formatHint(element) : undefined;
  if (!mask) return value;
  const shape = maskShape(mask);
  if (shapeOf(value) === shape) return value;
  const digits = digitsOf(value) || "123456789";
  const letters = value.replace(/[^a-z]/gi, "").toUpperCase() || "ABCDEF";
  let used = 0;
  return shape.replace(/[9A]/g, (slot) => {
    const source = slot === "9" ? digits : letters;
    return source[used++ % source.length];
  });
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
    const fitted = max && Number.isFinite(Number(max)) ? Math.min(atLeast, Number(max)) : atLeast;
    // Keeps trailing zeros such as 12.50 when the value was already in range.
    return fitted === number ? value : String(fitted);
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

/** Makes the nth repeat of an identifying value different, keeping its shape. */
function uniqueVariant(kind: GeneratedKind, value: string, repeat: number): string {
  if (repeat === 0) return value;
  if (kind === "email") return value.replace("@", `${repeat + 1}@`);
  if (kind === "username") return `${value}${repeat + 1}`;
  if (kind === "phone" || kind === "employeeId" || kind === "customerId" || kind === "invoiceId") {
    return value.replace(/\d+(?=\D*$)/, (digits) => String(Number(digits) + repeat).padStart(digits.length, "0").slice(-digits.length));
  }
  return value;
}

/** `repeat` counts earlier fields of this kind, for filling them with different values. */
export function generateValue(kind: GeneratedKind, settings: AutofillSettings, profile: Profile, element?: TextField, repeat = 0): string {
  const value = uniqueVariant(kind, GENERATORS[kind]({ settings, profile, element }), repeat);
  return element ? fitConstraints(fitFormat(value, kind, element), kind, element, profile) : value;
}

/** Returns the value of the first custom rule whose keyword appears in the field's description. */
export function customRuleValue(description: string, settings: AutofillSettings, profile: Profile): string | undefined {
  const rule = settings.customRules.find(({ match }) => ` ${description} `.includes(` ${splitWords(match)} `));
  return rule && renderProfileTemplate(rule.value, profile);
}

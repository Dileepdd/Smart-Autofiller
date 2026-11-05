import { faker } from "@faker-js/faker";
import { FieldKind } from "../content/classifier";
import { DataMode } from "../shared/types";

type Kind = Exclude<FieldKind, "skip">;
type TextField = HTMLInputElement | HTMLTextAreaElement;

const LEAP_DAY = "2024-02-29";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** These inputs only ever hold a well-formed value, so there is nothing to vary without a declared limit. */
const FIXED_FORMAT_TYPES = ["time", "month", "week", "datetime-local"];

/**
 * Fixed rather than random, so a failure can be repeated and a confirmation field
 * still matches the field it repeats.
 */
export const INVALID_VALUES: Partial<Record<Kind, string>> = {
  firstName: "12345",
  middleName: "12345",
  lastName: "12345",
  fullName: "12345",
  email: "user@@example",
  username: "a b!",
  password: "123",
  phone: "12345",
  domain: "not_a_domain",
  website: "not a url",
  url: "not a url",
  zip: "ABC",
  age: "-1",
  experience: "-1",
  companySize: "-1",
  number: "abc",
  amount: "abc",
  taxId: "INVALID-ID",
  gstin: "22AAAAA0000A1Z",
  aadhaar: "123456789013",
  pan: "ABCDE12345",
  ifsc: "ABCD1234567",
  upi: "no-at-sign",
  bankAccount: "12AB",
  passport: "1234567",
  voterId: "12345",
  drivingLicence: "XX",
  // Wrong in every date format, so it fails whichever one the page expects.
  dateOfBirth: "2024-13-45",
  date: "2024-13-45",
  futureDate: "2024-13-45"
};

const EDGE_NAMES = ["José", "Zoë", "Nguyễn", "Anne-Marie", "D'Arcy", "李"];
const EDGE_SURNAMES = ["O'Brien", "Smith-Jones", "García-López", "van der Berg", "Ng"];
const EDGE_TEXT = ["Emoji 🧪🚀", "نص عربي", "テスト 测试 테스트", "  spaces around  ", "<b>tags</b> & \"quotes\"", "Line one\nLine two"];

/** Valid but awkward values. Password and email have one answer each, so confirmation fields still match. */
const EDGE: Partial<Record<Kind, (valid: string) => string[]>> = {
  firstName: () => EDGE_NAMES,
  middleName: () => EDGE_NAMES,
  lastName: () => EDGE_SURNAMES,
  fullName: () => ["José María O'Brien-García", "Nguyễn Văn An", "Anne-Marie van der Berg"],
  email: (valid) => [`first.last+qa_1${valid.slice(valid.lastIndexOf("@"))}`],
  password: () => ["P@ss w0rd \"<>&'"],
  company: () => ["O'Reilly & Sons, Inc.", "Müller GmbH", "3M (India) Pvt. Ltd."],
  street: () => ["12/3-B, \"Rose\" Villa, #4", "Flat 2, O'Connell St."],
  address: () => ["12/3-B, \"Rose\" Villa, #4, São Paulo"],
  addressLine2: () => ["Apt. #4-B / Floor 2"],
  city: () => ["São Paulo", "Saint-Étienne", "Coeur d'Alene"],
  website: (valid) => [`${valid}/path?q=a%20b&x=1#top`],
  url: (valid) => [`${valid}/path?q=a%20b&x=1#top`],
  number: () => ["0"],
  amount: () => ["0.01"],
  age: () => ["0"],
  experience: () => ["0"],
  message: () => EDGE_TEXT,
  text: () => EDGE_TEXT
};

export function matchesPattern(value: string, pattern: string): boolean {
  try {
    return new RegExp(`^(?:${pattern})$`).test(value);
  } catch {
    return true;
  }
}

const lengthLimit = (element: TextField | undefined, name: "minlength" | "maxlength"): number | undefined => {
  const value = Number(element?.getAttribute(name));
  return value > 0 ? value : undefined;
};

/** Resizes a value exactly, keeping an email's domain and a digit string's digits. */
function resize(value: string, length: number): string {
  const at = value.lastIndexOf("@");
  const localLength = length - (value.length - at);
  if (at > 0 && localLength > 0) return value.slice(0, at).padEnd(localLength, "x").slice(0, localLength) + value.slice(at);
  return value.padEnd(length, /^[\d\s()+-]+$/.test(value) ? "1" : "x").slice(0, length);
}

const obeysPattern = (value: string, element?: TextField): boolean => {
  const pattern = element?.getAttribute("pattern");
  return !pattern || matchesPattern(value, pattern);
};

/** A limit test must otherwise be valid, or a failure would not be about the limit. */
function atLimit(valid: string, length: number | undefined, element?: TextField): string {
  if (!length) return valid;
  const value = resize(valid, length);
  return obeysPattern(value, element) ? value : valid;
}

function invalidText(kind: Kind, valid: string, element?: TextField): string {
  const known = INVALID_VALUES[kind];
  if (known !== undefined) return known;
  const maxLength = lengthLimit(element, "maxlength");
  if (maxLength) return resize(valid, maxLength + 1);
  const minLength = lengthLimit(element, "minlength");
  if (minLength && minLength > 1) return resize(valid, minLength - 1);
  return element?.hasAttribute("pattern") ? "!!!" : valid;
}

function edgeText(kind: Kind, valid: string, element?: TextField): string {
  const options = EDGE[kind]?.(valid);
  if (!options) return valid;
  const maxLength = lengthLimit(element, "maxlength");
  const value = faker.helpers.arrayElement(options).slice(0, maxLength);
  return obeysPattern(value, element) ? value : valid;
}

const numberAttribute = (element: TextField, name: string): number | undefined => {
  const value = element.getAttribute(name);
  return value && Number.isFinite(Number(value)) ? Number(value) : undefined;
};

/** The highest value the field's step allows, because a declared maximum may not land on a step. */
function highestStep(element: TextField, min: number | undefined, max: number): number {
  const step = numberAttribute(element, "step");
  if (!step || step <= 0) return max;
  const base = min ?? 0;
  return Number((base + Math.floor((max - base) / step) * step).toFixed(10));
}

/** A number input discards anything that is not a number, so only its value can be wrong. */
function numberValue(mode: DataMode, valid: string, element: TextField): string {
  const min = numberAttribute(element, "min");
  const max = numberAttribute(element, "max");
  if (mode === "minimum") return min === undefined ? valid : String(min);
  if (mode === "maximum") return max === undefined ? valid : String(highestStep(element, min, max));
  if (mode === "invalid") {
    if (max !== undefined) return String(max + 1);
    return String(min === undefined ? -1 : min - 1);
  }
  return (min ?? 0) <= 0 && (max ?? 0) >= 0 ? "0" : valid;
}

function shiftDate(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateValue(mode: DataMode, valid: string, element: TextField): string {
  const limit = (name: string): string | undefined => {
    const value = element.getAttribute(name) ?? "";
    return ISO_DATE.test(value) ? value : undefined;
  };
  const min = limit("min");
  const max = limit("max");
  if (mode === "minimum") return min ?? valid;
  if (mode === "maximum") return max ?? valid;
  if (mode === "invalid") {
    if (max) return shiftDate(max, 1);
    return min ? shiftDate(min, -1) : valid;
  }
  return (!min || LEAP_DAY >= min) && (!max || LEAP_DAY <= max) ? LEAP_DAY : valid;
}

/** Turns a valid generated value into the one the chosen data mode calls for. */
export function testValue(mode: DataMode, kind: Kind, valid: string, element?: TextField): string {
  if (mode === "valid") return valid;
  const type = element?.getAttribute("type")?.toLowerCase() ?? "";
  if (element && type === "number") return numberValue(mode, valid, element);
  if (element && type === "date") return dateValue(mode, valid, element);
  if (FIXED_FORMAT_TYPES.includes(type)) return valid;
  if (mode === "invalid") return invalidText(kind, valid, element);
  if (mode === "edge") return edgeText(kind, valid, element);
  return atLimit(valid, lengthLimit(element, mode === "minimum" ? "minlength" : "maxlength"), element);
}

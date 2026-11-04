import { fieldSignals } from "./context";

export type FieldKind =
  | "firstName" | "middleName" | "lastName" | "fullName" | "email"
  | "company" | "jobTitle" | "domain" | "website" | "username" | "password"
  | "phone" | "age" | "experience" | "taxId" | "zip" | "street" | "addressLine2"
  | "address" | "city" | "state" | "country" | "dateOfBirth" | "date" | "futureDate"
  | "dateTime" | "time" | "month" | "week" | "url" | "number" | "message" | "text"
  | "skip";

const AUTOCOMPLETE_WEIGHT = 100;

/** The first match wins, so specific terms sit above the general terms they contain. */
const RULES: ReadonlyArray<readonly [FieldKind, RegExp]> = [
  ["skip", /\b(search|card ?(number|no)|credit card|debit card|cvv|cvc|security code|one time (code|password)|otp|captcha|verification code)\b/],
  ["email", /\b(e ?mail|email ?address)\b/],
  ["password", /\b(pass ?word|pass ?code|passwd|pwd)\b/],
  ["phone", /\b(phone ?(no|number)?|mobile ?(no|number)?|telephone|tel|cell ?(phone|number)?|whats ?app|fax|contact ?(no|number))\b/],
  ["dateOfBirth", /\b(date of birth|dateofbirth|birth ?date|birth ?day|dob|bday)\b/],
  ["firstName", /\b(first ?name|fname|given ?name|forename)\b/],
  ["middleName", /\b(middle ?name|mname|middle initial)\b/],
  ["lastName", /\b(last ?name|lname|surname|family ?name)\b/],
  ["username", /\b(user ?name|user ?id|login( ?(id|name))?|nick ?name|screen ?name)\b/],
  // Check domain and website before company: labels such as "Company Domain" contain both terms.
  ["domain", /\bdomain\b/],
  ["website", /\b(web ?site|home ?page|company url)\b/],
  ["taxId", /\b(federal tax|tax ?id|tax identification|tax ?(no|number)|tin|ein|vat( ?(no|number|id))?|gstin|gst( ?(no|number))?|pan( ?(no|number|card))?|abn)\b/],
  ["experience", /\b(experience|yoe|years? of exp|exp years)\b/],
  ["age", /\bage\b/],
  ["zip", /\b(zip( ?code)?|postal( ?code)?|post ?code|pin ?code)\b/],
  ["addressLine2", /\b(address ?(line)? ?2|addr ?2|apartment|apt|suite|flat ?(no|number)?)\b/],
  ["street", /\b(street|address ?line( ?1)?|address ?1|addr ?1)\b/],
  ["city", /\b(city|town|suburb|locality)\b/],
  ["state", /\b(state|province|region)\b/],
  ["country", /\b(country|nation|nationality)\b/],
  ["address", /\b(address|addr)\b/],
  ["jobTitle", /\b(job ?title|job role|designation|occupation|position)\b/],
  ["fullName", /\b(full ?name|(candidate|contact|applicant|customer|employee|legal|your|person) ?name)\b|^name$/],
  ["company", /\b(company|organi[sz]ation|employer|business|vendor|firm)\b/],
  // "Project Name" must outvote a generic name="name" attribute instead of becoming a person's name.
  ["text", /\bname\b/],
  ["futureDate", /\b(expir(y|es|ation)|end date|due( date)?|valid (until|through)|deadline|renewal)\b/],
  ["date", /\bdate\b/],
  ["url", /\b(url|link|portfolio|linkedin|github)\b/],
  ["message", /\b(message|comments?|notes?|description|bio|about|summary|details|feedback|remarks|cover letter|reason)\b/]
];

const AUTOCOMPLETE_KINDS: Readonly<Record<string, FieldKind>> = {
  "name": "fullName",
  "given-name": "firstName",
  "additional-name": "middleName",
  "family-name": "lastName",
  "email": "email",
  "username": "username",
  "new-password": "password",
  "current-password": "password",
  "organization": "company",
  "organization-title": "jobTitle",
  "street-address": "street",
  "address-line1": "street",
  "address-line2": "addressLine2",
  "address-level1": "state",
  "address-level2": "city",
  "country": "country",
  "country-name": "country",
  "postal-code": "zip",
  "bday": "dateOfBirth",
  "tel": "phone",
  "tel-national": "phone",
  "url": "website",
  "one-time-code": "skip"
};

/** The browser only accepts certain values for these input types; the last kind is the default. */
const TYPE_KINDS: Readonly<Record<string, readonly FieldKind[]>> = {
  email: ["email"],
  password: ["password"],
  tel: ["phone"],
  url: ["website", "domain", "url"],
  date: ["dateOfBirth", "futureDate", "date"],
  "datetime-local": ["dateTime"],
  time: ["time"],
  month: ["month"],
  week: ["week"],
  number: ["age", "experience", "phone", "zip", "taxId", "number"]
};

const matchRule = (text: string): FieldKind | undefined => RULES.find(([, pattern]) => pattern.test(text))?.[0];

function autocompleteKind(element: HTMLElement): FieldKind | undefined {
  const token = (element.getAttribute("autocomplete") ?? "").trim().toLowerCase().split(/\s+/).pop() ?? "";
  return token.startsWith("cc-") ? "skip" : AUTOCOMPLETE_KINDS[token];
}

const isSearchField = (element: HTMLElement, type: string): boolean =>
  type === "search" || element.getAttribute("role") === "searchbox" || element.closest("[role=search]") !== null;

const inputType = (element: HTMLElement): string =>
  element.tagName === "INPUT" ? (element.getAttribute("type") ?? "text").toLowerCase() : "";

export function classifyField(element: HTMLElement): FieldKind {
  const type = inputType(element);
  if (isSearchField(element, type)) return "skip";

  const scores = new Map<FieldKind, number>();
  const vote = (kind: FieldKind | undefined, weight: number): void => {
    if (kind) scores.set(kind, (scores.get(kind) ?? 0) + weight);
  };
  vote(autocompleteKind(element), AUTOCOMPLETE_WEIGHT);
  for (const { text, weight } of fieldSignals(element)) vote(matchRule(text), weight);

  const allowed = TYPE_KINDS[type];
  const ranked = [...scores.entries()]
    .filter(([kind]) => !allowed || kind === "skip" || allowed.includes(kind))
    .sort((a, b) => b[1] - a[1]);
  if (ranked.length) return ranked[0][0];

  if (allowed) return allowed[allowed.length - 1];
  if (element.getAttribute("inputmode") === "numeric") return "number";
  return element.tagName === "TEXTAREA" || element.isContentEditable ? "message" : "text";
}

/** Normalised text describing a field, used for reports and custom rules. */
export const getFieldDescription = (element: HTMLElement): string =>
  fieldSignals(element).map(({ text }) => text).join(" ");

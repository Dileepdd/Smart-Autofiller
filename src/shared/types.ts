export type SelectionMode = "match" | "first" | "random";
export type MultiSelectMode = "first" | "random" | "multiple";
export type CheckboxMode = "required" | "all" | "none";
export type FillScope = "all" | "form";
export type CountryCode = "US" | "IN" | "GB" | "CA" | "AU";
export type PhoneFormat = "national" | "international";
export type DateFormat = "YYYY-MM-DD" | "DD/MM/YYYY" | "MM/DD/YYYY";
export type Gender = "any" | "male" | "female";
export type UsernameMode = "name" | "random";
export type TextMode = "realistic" | "random";
export type AddressFormat = "standard" | "international";
export type NameRegion = CountryCode | "country";
export type CurrencySetting = "auto" | "INR" | "USD" | "GBP" | "CAD" | "AUD";

/** Fills any field whose description contains `match`. `value` is a template, see template.ts. */
export interface CustomRule {
  match: string;
  value: string;
}

export const SETTINGS_VERSION = 2;

export interface AutofillSettings {
  settingsVersion: number;

  // Identity. An empty name, company, department or title means a generated one.
  emailDomain: string;
  domainSuffix: string;
  ageMin: number;
  ageMax: number;
  experienceMin: number;
  experienceMax: number;
  firstName: string;
  lastName: string;
  includeMiddleName: boolean;
  /** Where names, and so email addresses, come from. "country" follows the Country setting. */
  nameRegion: NameRegion;
  gender: Gender;
  usernameMode: UsernameMode;
  passwordPattern: string;
  companyName: string;
  department: string;
  jobTitle: string;

  // Region
  country: CountryCode;
  phoneFormat: PhoneFormat;
  dateFormat: DateFormat;
  currency: CurrencySetting;
  addressFormat: AddressFormat;

  // Data generation
  textMode: TextMode;
  numberMin: number;
  numberMax: number;
  decimalPrecision: number;
  dateStart: string;
  dateEnd: string;
  companySizeMin: number;
  companySizeMax: number;
  employeeIdPattern: string;
  customerIdPattern: string;
  invoiceIdPattern: string;

  // Filling behavior
  dropdownMode: SelectionMode;
  radioMode: SelectionMode;
  multiSelectMode: MultiSelectMode;
  checkboxMode: CheckboxMode;
  fillExisting: boolean;
  /** Fill straight from the toolbar icon with no popup. Off, the icon opens the popup instead. */
  fillOnOpen: boolean;
  /** Dropdowns built from page elements have to be opened and waited for, so they are opt-in. */
  fillCustomDropdowns: boolean;
  fillScope: FillScope;
  detectDynamic: boolean;
  includeFrames: boolean;
  uniqueValues: boolean;

  customRules: CustomRule[];

  // Advanced
  highlightFilled: boolean;
  detailedReport: boolean;
  reuseProfile: boolean;
  /** Fixes the generated data while reuseProfile is on. */
  profileSeed: number;
}

export const DEFAULT_SETTINGS: AutofillSettings = {
  settingsVersion: SETTINGS_VERSION,

  emailDomain: "example.com",
  domainSuffix: ".com",
  ageMin: 18,
  ageMax: 100,
  experienceMin: 0,
  experienceMax: 20,
  firstName: "",
  lastName: "",
  includeMiddleName: true,
  nameRegion: "IN",
  gender: "any",
  usernameMode: "name",
  passwordPattern: "",
  companyName: "",
  department: "",
  jobTitle: "",

  country: "IN",
  phoneFormat: "national",
  dateFormat: "YYYY-MM-DD",
  currency: "auto",
  addressFormat: "standard",

  textMode: "realistic",
  numberMin: 1,
  numberMax: 100,
  decimalPrecision: 0,
  dateStart: "",
  dateEnd: "",
  companySizeMin: 10,
  companySizeMax: 500,
  employeeIdPattern: "EMP-{number:1000-9999}",
  customerIdPattern: "CUST-{number:10000-99999}",
  invoiceIdPattern: "INV-{number:10000-99999}",

  dropdownMode: "match",
  radioMode: "match",
  multiSelectMode: "first",
  checkboxMode: "required",
  fillExisting: true,
  fillOnOpen: true,
  fillCustomDropdowns: false,
  fillScope: "all",
  detectDynamic: true,
  includeFrames: true,
  uniqueValues: false,

  customRules: [],

  highlightFilled: false,
  detailedReport: false,
  reuseProfile: false,
  profileSeed: 0
};

/** Values a saved test profile may override. Everything else stays global. */
export const PROFILE_KEYS = [
  "country", "emailDomain", "ageMin", "ageMax", "experienceMin", "experienceMax",
  "firstName", "lastName", "companyName", "department", "jobTitle"
] as const;

export type ProfileKey = (typeof PROFILE_KEYS)[number];

export interface TestProfile {
  id: string;
  name: string;
  overrides: Partial<Pick<AutofillSettings, ProfileKey>>;
  /** Checked before the global rules, so a profile can supply its own values. */
  customRules: CustomRule[];
}

export interface ProfileStore {
  profiles: TestProfile[];
  activeProfileId: string | null;
}

export interface FillResult {
  filled: number;
  skipped: number;
  errors: number;
  /** Controls that were tried but cannot be filled reliably, such as an unknown date picker. */
  unsupported: number;
  details: string[];
}

export interface UndoResult {
  restored: number;
  /** Fields changed by the fill that cannot be put back safely, such as custom dropdowns. */
  notRestored: number;
}

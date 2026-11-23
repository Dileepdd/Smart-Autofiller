export type SelectionMode = "match" | "first" | "random";
export type MultiSelectMode = "first" | "random" | "multiple";
export type CheckboxMode = "required" | "all" | "none";
export type FillScope = "all" | "form";
export type CountryCode = "US" | "IN" | "GB" | "CA" | "AU" | "DE" | "FR" | "ES" | "PT" | "IT" | "NL";
/** "page" uses the country or language the page itself shows, and otherwise the Country setting. */
export type DataLanguage = "page" | CountryCode;
export type PhoneFormat = "national" | "international";
export type DateFormat = "YYYY-MM-DD" | "DD/MM/YYYY" | "MM/DD/YYYY";
export type Gender = "any" | "male" | "female";
export type UsernameMode = "name" | "random";
export type TextMode = "realistic" | "random";
export type AddressFormat = "standard" | "international";
export type NameRegion = CountryCode | "country";
export type CurrencySetting = "auto" | "INR" | "USD" | "GBP" | "CAD" | "AUD" | "EUR";
export type DataMode = "valid" | "invalid" | "minimum" | "maximum" | "edge";
export type ReportFormat = "text" | "markdown" | "json";
export type DatasetOrder = "next" | "same" | "random";
export type DatasetAtEnd = "loop" | "stop";
/** "generate" fills a blank cell's field with generated data; "empty" leaves it alone. */
export type DatasetBlank = "generate" | "empty";

/** The badge stays on the toolbar icon, so nobody tests with bad data by accident. */
export const DATA_MODES: Record<DataMode, { label: string; badge: string }> = {
  valid: { label: "Valid data", badge: "" },
  invalid: { label: "Invalid data", badge: "INV" },
  minimum: { label: "Minimum limits", badge: "MIN" },
  maximum: { label: "Maximum limits", badge: "MAX" },
  edge: { label: "Edge cases", badge: "EDGE" }
};

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
  dataLanguage: DataLanguage;
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
  /** What text and number fields receive. Dropdowns and choices stay valid so a form stays usable. */
  dataMode: DataMode;
  requiredOnly: boolean;
  dropdownMode: SelectionMode;
  radioMode: SelectionMode;
  multiSelectMode: MultiSelectMode;
  checkboxMode: CheckboxMode;
  fillExisting: boolean;
  /** Fill straight from the toolbar icon with no popup. Off, the icon opens the popup instead. */
  fillOnOpen: boolean;
  /** Dropdowns built from page elements have to be opened and waited for, so they are opt-in. */
  fillCustomDropdowns: boolean;
  fillDependentDropdowns: boolean;
  fillScope: FillScope;
  detectDynamic: boolean;
  includeFrames: boolean;
  uniqueValues: boolean;

  customRules: CustomRule[];

  // Advanced
  highlightFilled: boolean;
  detailedReport: boolean;
  /** After a fill, list the fields the page marked invalid, with its messages. */
  validationReport: boolean;
  /** How Copy for bug report writes the last fill. */
  reportFormat: ReportFormat;
  /** Fill from the uploaded dataset on every click. The right-click menu can use it either way. */
  datasetEnabled: boolean;
  datasetOrder: DatasetOrder;
  datasetAtEnd: DatasetAtEnd;
  datasetBlank: DatasetBlank;
  /** Adds injection strings to the field menu. Off by default, for authorised testing only. */
  showSecurityValues: boolean;
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
  dataLanguage: "page",
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

  dataMode: "valid",
  requiredOnly: false,
  dropdownMode: "match",
  radioMode: "match",
  multiSelectMode: "first",
  checkboxMode: "required",
  fillExisting: true,
  fillOnOpen: true,
  fillCustomDropdowns: false,
  fillDependentDropdowns: false,
  fillScope: "all",
  detectDynamic: true,
  includeFrames: true,
  uniqueValues: false,

  customRules: [],

  highlightFilled: false,
  detailedReport: false,
  validationReport: false,
  reportFormat: "markdown",
  datasetEnabled: false,
  datasetOrder: "next",
  datasetAtEnd: "loop",
  datasetBlank: "generate",
  showSecurityValues: false,
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

/** Kinds of field, grouped by how long a person takes to fill them by hand. */
export type FieldType = "text" | "longText" | "email" | "phone" | "number" | "date" | "dropdown" | "choice";

/** What a fill did, for the usage statistics. Only counts: no values and no page addresses. */
export interface FillStats {
  byType: Partial<Record<FieldType, number>>;
  ms: number;
}

export interface FillResult {
  stats?: FillStats;
  /** Set when the fill used a dataset row, for the note on the page and the report. */
  datasetRow?: { number: number; total: number };
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

export interface ClearResult {
  cleared: number;
  /** Fields holding a value with no safe way to empty them, such as a selected radio button. */
  notCleared: number;
}

export interface FieldResult {
  filled: boolean;
  message: string;
}

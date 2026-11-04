export type DropdownMode = "first" | "random";
export type CountryCode = "US" | "IN" | "GB" | "CA" | "AU";
export type PhoneFormat = "national" | "international";
export type DateFormat = "YYYY-MM-DD" | "DD/MM/YYYY" | "MM/DD/YYYY";

/** Fills any field whose description contains `match`. `value` may use tokens such as {firstName}. */
export interface CustomRule {
  match: string;
  value: string;
}

export interface AutofillSettings {
  emailDomain: string;
  ageMin: number;
  ageMax: number;
  experienceMin: number;
  experienceMax: number;
  domainSuffix: string;
  dropdownMode: DropdownMode;
  fillExisting: boolean;
  country: CountryCode;
  phoneFormat: PhoneFormat;
  dateFormat: DateFormat;
  customRules: CustomRule[];
}

export const DEFAULT_SETTINGS: AutofillSettings = {
  emailDomain: "example.com",
  ageMin: 18,
  ageMax: 100,
  experienceMin: 0,
  experienceMax: 20,
  domainSuffix: ".com",
  dropdownMode: "first",
  fillExisting: false,
  country: "IN",
  phoneFormat: "national",
  dateFormat: "YYYY-MM-DD",
  customRules: []
};

export interface FillResult {
  filled: number;
  skipped: number;
  errors: number;
  /** Controls that were tried but cannot be filled reliably, such as an unknown date picker. */
  unsupported: number;
  details: string[];
}

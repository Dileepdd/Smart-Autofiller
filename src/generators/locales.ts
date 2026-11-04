import { CountryCode } from "../shared/types";

export interface City {
  name: string;
  postalCode: string;
}

export interface Region {
  name: string;
  code: string;
  cities: City[];
}

/** `phone` and `taxId` are faker.helpers.replaceSymbols patterns: # is a digit, ? a letter. */
export interface Locale {
  code: CountryCode;
  name: string;
  aliases: string[];
  dialCode: string;
  phone: string;
  taxId: string;
  regions: Region[];
}

// Phone patterns stay inside each country's ranges reserved for fictional use where one exists.
export const LOCALES: Locale[] = [
  {
    code: "US",
    name: "United States",
    aliases: ["USA", "United States of America", "America"],
    dialCode: "+1",
    phone: "(2##) 555-01##",
    taxId: "12-#######",
    regions: [
      { name: "California", code: "CA", cities: [{ name: "Los Angeles", postalCode: "90012" }, { name: "San Francisco", postalCode: "94103" }] },
      { name: "Texas", code: "TX", cities: [{ name: "Austin", postalCode: "78701" }, { name: "Houston", postalCode: "77002" }] },
      { name: "New York", code: "NY", cities: [{ name: "New York", postalCode: "10001" }, { name: "Buffalo", postalCode: "14202" }] },
      { name: "Illinois", code: "IL", cities: [{ name: "Chicago", postalCode: "60601" }] },
      { name: "Washington", code: "WA", cities: [{ name: "Seattle", postalCode: "98101" }] }
    ]
  },
  {
    code: "IN",
    name: "India",
    aliases: ["Bharat"],
    dialCode: "+91",
    phone: "9#### #####",
    // The fourth letter of a PAN gives the holder type, and P means an individual.
    taxId: "???P?####?",
    regions: [
      { name: "Andhra Pradesh", code: "AP", cities: [{ name: "Visakhapatnam", postalCode: "530001" }, { name: "Vijayawada", postalCode: "520001" }] },
      { name: "Karnataka", code: "KA", cities: [{ name: "Bengaluru", postalCode: "560001" }, { name: "Mysuru", postalCode: "570001" }] },
      { name: "Maharashtra", code: "MH", cities: [{ name: "Mumbai", postalCode: "400001" }, { name: "Pune", postalCode: "411001" }] },
      { name: "Tamil Nadu", code: "TN", cities: [{ name: "Chennai", postalCode: "600001" }, { name: "Coimbatore", postalCode: "641001" }] },
      { name: "Telangana", code: "TS", cities: [{ name: "Hyderabad", postalCode: "500001" }] }
    ]
  },
  {
    code: "GB",
    name: "United Kingdom",
    aliases: ["UK", "Great Britain", "Britain"],
    dialCode: "+44",
    phone: "07700 900###",
    taxId: "GB#########",
    regions: [
      { name: "England", code: "ENG", cities: [{ name: "London", postalCode: "E1 6AN" }, { name: "Manchester", postalCode: "M1 1AE" }] },
      { name: "Scotland", code: "SCT", cities: [{ name: "Edinburgh", postalCode: "EH1 1YZ" }, { name: "Glasgow", postalCode: "G1 1XQ" }] },
      { name: "Wales", code: "WLS", cities: [{ name: "Cardiff", postalCode: "CF10 1EP" }] }
    ]
  },
  {
    code: "CA",
    name: "Canada",
    aliases: [],
    dialCode: "+1",
    phone: "(2##) 555-01##",
    taxId: "#########RT0001",
    regions: [
      { name: "Ontario", code: "ON", cities: [{ name: "Toronto", postalCode: "M5V 2T6" }, { name: "Ottawa", postalCode: "K1P 1J1" }] },
      { name: "British Columbia", code: "BC", cities: [{ name: "Vancouver", postalCode: "V6B 1A1" }] },
      { name: "Quebec", code: "QC", cities: [{ name: "Montreal", postalCode: "H2Y 1C6" }] },
      { name: "Alberta", code: "AB", cities: [{ name: "Calgary", postalCode: "T2P 1J9" }] }
    ]
  },
  {
    code: "AU",
    name: "Australia",
    aliases: [],
    dialCode: "+61",
    phone: "0491 570 ###",
    taxId: "## ### ### ###",
    regions: [
      { name: "New South Wales", code: "NSW", cities: [{ name: "Sydney", postalCode: "2000" }, { name: "Newcastle", postalCode: "2300" }] },
      { name: "Victoria", code: "VIC", cities: [{ name: "Melbourne", postalCode: "3000" }] },
      { name: "Queensland", code: "QLD", cities: [{ name: "Brisbane", postalCode: "4000" }] },
      { name: "Western Australia", code: "WA", cities: [{ name: "Perth", postalCode: "6000" }] }
    ]
  }
];

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

export const localeByCode = (code: CountryCode): Locale =>
  LOCALES.find((locale) => locale.code === code) ?? LOCALES[0];

export const findLocale = (label: string): Locale | undefined =>
  LOCALES.find((locale) => [locale.name, locale.code, ...locale.aliases].some((name) => same(name, label)));

export const findRegion = (locale: Locale, label: string): Region | undefined =>
  locale.regions.find((region) => same(region.name, label) || same(region.code, label));

export function findCity(locale: Locale, label: string): { region: Region; city: City } | undefined {
  for (const region of locale.regions) {
    const city = region.cities.find((candidate) => same(candidate.name, label));
    if (city) return { region, city };
  }
  return undefined;
}

import { foldAccents } from "../shared/text";
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
  currency: string;
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
    currency: "USD",
    phone: "(2##) 555-01##",
    taxId: "12-#######",
    // Every state and DC, so any state a form offers has a matching city and ZIP code.
    regions: [
      { name: "Alabama", code: "AL", cities: [{ name: "Birmingham", postalCode: "35203" }, { name: "Montgomery", postalCode: "36104" }] },
      { name: "Alaska", code: "AK", cities: [{ name: "Anchorage", postalCode: "99501" }, { name: "Juneau", postalCode: "99801" }] },
      { name: "Arizona", code: "AZ", cities: [{ name: "Phoenix", postalCode: "85004" }, { name: "Tucson", postalCode: "85701" }] },
      { name: "Arkansas", code: "AR", cities: [{ name: "Little Rock", postalCode: "72201" }] },
      { name: "California", code: "CA", cities: [{ name: "Los Angeles", postalCode: "90012" }, { name: "San Francisco", postalCode: "94103" }] },
      { name: "Colorado", code: "CO", cities: [{ name: "Denver", postalCode: "80202" }] },
      { name: "Connecticut", code: "CT", cities: [{ name: "Hartford", postalCode: "06103" }] },
      { name: "Delaware", code: "DE", cities: [{ name: "Wilmington", postalCode: "19801" }] },
      { name: "District of Columbia", code: "DC", cities: [{ name: "Washington", postalCode: "20001" }] },
      { name: "Florida", code: "FL", cities: [{ name: "Miami", postalCode: "33130" }, { name: "Orlando", postalCode: "32801" }] },
      { name: "Georgia", code: "GA", cities: [{ name: "Atlanta", postalCode: "30303" }] },
      { name: "Hawaii", code: "HI", cities: [{ name: "Honolulu", postalCode: "96813" }] },
      { name: "Idaho", code: "ID", cities: [{ name: "Boise", postalCode: "83702" }] },
      { name: "Illinois", code: "IL", cities: [{ name: "Chicago", postalCode: "60601" }] },
      { name: "Indiana", code: "IN", cities: [{ name: "Indianapolis", postalCode: "46204" }] },
      { name: "Iowa", code: "IA", cities: [{ name: "Des Moines", postalCode: "50309" }] },
      { name: "Kansas", code: "KS", cities: [{ name: "Wichita", postalCode: "67202" }] },
      { name: "Kentucky", code: "KY", cities: [{ name: "Louisville", postalCode: "40202" }] },
      { name: "Louisiana", code: "LA", cities: [{ name: "New Orleans", postalCode: "70112" }] },
      { name: "Maine", code: "ME", cities: [{ name: "Portland", postalCode: "04101" }] },
      { name: "Maryland", code: "MD", cities: [{ name: "Baltimore", postalCode: "21201" }] },
      { name: "Massachusetts", code: "MA", cities: [{ name: "Boston", postalCode: "02108" }] },
      { name: "Michigan", code: "MI", cities: [{ name: "Detroit", postalCode: "48226" }] },
      { name: "Minnesota", code: "MN", cities: [{ name: "Minneapolis", postalCode: "55401" }] },
      { name: "Mississippi", code: "MS", cities: [{ name: "Jackson", postalCode: "39201" }] },
      { name: "Missouri", code: "MO", cities: [{ name: "Kansas City", postalCode: "64105" }, { name: "St. Louis", postalCode: "63101" }] },
      { name: "Montana", code: "MT", cities: [{ name: "Billings", postalCode: "59101" }] },
      { name: "Nebraska", code: "NE", cities: [{ name: "Omaha", postalCode: "68102" }] },
      { name: "Nevada", code: "NV", cities: [{ name: "Las Vegas", postalCode: "89101" }] },
      { name: "New Hampshire", code: "NH", cities: [{ name: "Manchester", postalCode: "03101" }] },
      { name: "New Jersey", code: "NJ", cities: [{ name: "Newark", postalCode: "07102" }] },
      { name: "New Mexico", code: "NM", cities: [{ name: "Albuquerque", postalCode: "87102" }] },
      { name: "New York", code: "NY", cities: [{ name: "New York", postalCode: "10001" }, { name: "Buffalo", postalCode: "14202" }] },
      { name: "North Carolina", code: "NC", cities: [{ name: "Charlotte", postalCode: "28202" }] },
      { name: "North Dakota", code: "ND", cities: [{ name: "Fargo", postalCode: "58102" }] },
      { name: "Ohio", code: "OH", cities: [{ name: "Columbus", postalCode: "43215" }] },
      { name: "Oklahoma", code: "OK", cities: [{ name: "Oklahoma City", postalCode: "73102" }] },
      { name: "Oregon", code: "OR", cities: [{ name: "Portland", postalCode: "97204" }] },
      { name: "Pennsylvania", code: "PA", cities: [{ name: "Philadelphia", postalCode: "19107" }, { name: "Pittsburgh", postalCode: "15222" }] },
      { name: "Rhode Island", code: "RI", cities: [{ name: "Providence", postalCode: "02903" }] },
      { name: "South Carolina", code: "SC", cities: [{ name: "Columbia", postalCode: "29201" }] },
      { name: "South Dakota", code: "SD", cities: [{ name: "Sioux Falls", postalCode: "57104" }] },
      { name: "Tennessee", code: "TN", cities: [{ name: "Nashville", postalCode: "37203" }] },
      { name: "Texas", code: "TX", cities: [{ name: "Austin", postalCode: "78701" }, { name: "Houston", postalCode: "77002" }] },
      { name: "Utah", code: "UT", cities: [{ name: "Salt Lake City", postalCode: "84111" }] },
      { name: "Vermont", code: "VT", cities: [{ name: "Burlington", postalCode: "05401" }] },
      { name: "Virginia", code: "VA", cities: [{ name: "Richmond", postalCode: "23219" }] },
      { name: "Washington", code: "WA", cities: [{ name: "Seattle", postalCode: "98101" }] },
      { name: "West Virginia", code: "WV", cities: [{ name: "Charleston", postalCode: "25301" }] },
      { name: "Wisconsin", code: "WI", cities: [{ name: "Milwaukee", postalCode: "53202" }] },
      { name: "Wyoming", code: "WY", cities: [{ name: "Cheyenne", postalCode: "82001" }] }
    ]
  },
  {
    code: "IN",
    name: "India",
    aliases: ["Bharat"],
    dialCode: "+91",
    currency: "INR",
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
    currency: "GBP",
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
    currency: "CAD",
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
    currency: "AUD",
    phone: "0491 570 ###",
    taxId: "## ### ### ###",
    regions: [
      { name: "New South Wales", code: "NSW", cities: [{ name: "Sydney", postalCode: "2000" }, { name: "Newcastle", postalCode: "2300" }] },
      { name: "Victoria", code: "VIC", cities: [{ name: "Melbourne", postalCode: "3000" }] },
      { name: "Queensland", code: "QLD", cities: [{ name: "Brisbane", postalCode: "4000" }] },
      { name: "Western Australia", code: "WA", cities: [{ name: "Perth", postalCode: "6000" }] }
    ]
  },
  {
    code: "DE",
    name: "Germany",
    aliases: ["Deutschland", "Allemagne", "Alemania", "Alemanha", "Germania", "Duitsland"],
    dialCode: "+49",
    currency: "EUR",
    phone: "0151 ########",
    taxId: "DE#########",
    regions: [
      { name: "Berlin", code: "BE", cities: [{ name: "Berlin", postalCode: "10115" }] },
      { name: "Bayern", code: "BY", cities: [{ name: "München", postalCode: "80331" }, { name: "Nürnberg", postalCode: "90402" }] },
      { name: "Hamburg", code: "HH", cities: [{ name: "Hamburg", postalCode: "20095" }] },
      { name: "Nordrhein-Westfalen", code: "NW", cities: [{ name: "Köln", postalCode: "50667" }, { name: "Düsseldorf", postalCode: "40213" }] },
      { name: "Hessen", code: "HE", cities: [{ name: "Frankfurt am Main", postalCode: "60311" }] }
    ]
  },
  {
    code: "FR",
    name: "France",
    aliases: ["Frankreich", "Francia", "França", "Frankrijk"],
    dialCode: "+33",
    currency: "EUR",
    phone: "06 ## ## ## ##",
    taxId: "FR###########",
    regions: [
      { name: "Île-de-France", code: "IDF", cities: [{ name: "Paris", postalCode: "75001" }] },
      { name: "Auvergne-Rhône-Alpes", code: "ARA", cities: [{ name: "Lyon", postalCode: "69001" }] },
      { name: "Provence-Alpes-Côte d'Azur", code: "PAC", cities: [{ name: "Marseille", postalCode: "13001" }, { name: "Nice", postalCode: "06000" }] },
      { name: "Occitanie", code: "OCC", cities: [{ name: "Toulouse", postalCode: "31000" }] },
      { name: "Nouvelle-Aquitaine", code: "NAQ", cities: [{ name: "Bordeaux", postalCode: "33000" }] }
    ]
  },
  {
    code: "ES",
    name: "Spain",
    aliases: ["España", "Espagne", "Spanien", "Espanha", "Spagna", "Spanje"],
    dialCode: "+34",
    currency: "EUR",
    phone: "6## ### ###",
    taxId: "########?",
    regions: [
      { name: "Madrid", code: "MD", cities: [{ name: "Madrid", postalCode: "28001" }] },
      { name: "Cataluña", code: "CT", cities: [{ name: "Barcelona", postalCode: "08001" }] },
      { name: "Andalucía", code: "AN", cities: [{ name: "Sevilla", postalCode: "41001" }, { name: "Málaga", postalCode: "29001" }] },
      { name: "Comunidad Valenciana", code: "VC", cities: [{ name: "Valencia", postalCode: "46001" }] },
      { name: "País Vasco", code: "PV", cities: [{ name: "Bilbao", postalCode: "48001" }] }
    ]
  },
  {
    code: "PT",
    name: "Portugal",
    aliases: ["Portugalia", "Portogallo"],
    dialCode: "+351",
    currency: "EUR",
    phone: "9## ### ###",
    taxId: "#########",
    regions: [
      { name: "Lisboa", code: "LI", cities: [{ name: "Lisboa", postalCode: "1100-148" }] },
      { name: "Porto", code: "PO", cities: [{ name: "Porto", postalCode: "4000-322" }] },
      { name: "Faro", code: "FA", cities: [{ name: "Faro", postalCode: "8000-138" }] },
      { name: "Braga", code: "BR", cities: [{ name: "Braga", postalCode: "4700-435" }] },
      { name: "Coimbra", code: "CO", cities: [{ name: "Coimbra", postalCode: "3000-142" }] }
    ]
  },
  {
    code: "IT",
    name: "Italy",
    aliases: ["Italia", "Italie", "Italien", "Itália", "Italië"],
    dialCode: "+39",
    currency: "EUR",
    phone: "3## ### ####",
    // The shape of a codice fiscale: six letters, two digits, a letter, two digits, a letter, three digits, a letter.
    taxId: "??????##?##?###?",
    regions: [
      { name: "Lazio", code: "LAZ", cities: [{ name: "Roma", postalCode: "00184" }] },
      { name: "Lombardia", code: "LOM", cities: [{ name: "Milano", postalCode: "20121" }] },
      { name: "Campania", code: "CAM", cities: [{ name: "Napoli", postalCode: "80133" }] },
      { name: "Piemonte", code: "PIE", cities: [{ name: "Torino", postalCode: "10121" }] },
      { name: "Toscana", code: "TOS", cities: [{ name: "Firenze", postalCode: "50122" }] }
    ]
  },
  {
    code: "NL",
    name: "Netherlands",
    aliases: ["Nederland", "The Netherlands", "Holland", "Pays-Bas", "Niederlande", "Países Bajos", "Paesi Bassi"],
    dialCode: "+31",
    currency: "EUR",
    phone: "06 ########",
    taxId: "NL#########B01",
    regions: [
      { name: "Noord-Holland", code: "NH", cities: [{ name: "Amsterdam", postalCode: "1012 AB" }] },
      { name: "Zuid-Holland", code: "ZH", cities: [{ name: "Rotterdam", postalCode: "3011 AA" }, { name: "Den Haag", postalCode: "2511 AA" }] },
      { name: "Utrecht", code: "UT", cities: [{ name: "Utrecht", postalCode: "3511 AA" }] },
      { name: "Noord-Brabant", code: "NB", cities: [{ name: "Eindhoven", postalCode: "5611 AA" }] },
      { name: "Groningen", code: "GR", cities: [{ name: "Groningen", postalCode: "9711 AA" }] }
    ]
  }
];

/** Ignores case and accents, so a page's "Espana" or "MÜNCHEN" still matches. */
const same = (a: string, b: string): boolean => foldAccents(a.trim().toLowerCase()) === foldAccents(b.trim().toLowerCase());

export const localeByCode = (code: CountryCode): Locale =>
  LOCALES.find((locale) => locale.code === code) ?? LOCALES[0];

export const findLocale = (label: string): Locale | undefined =>
  LOCALES.find((locale) => [locale.name, locale.code, ...locale.aliases].some((name) => same(name, label)));

export const findRegion = (locale: Locale, label: string): Region | undefined =>
  locale.regions.find((region) => same(region.name, label) || same(region.code, label));

/** Some names exist in more than one region, such as Portland in Maine and Oregon, so a region already chosen wins. */
export function findCity(locale: Locale, label: string, preferredRegion = ""): { region: Region; city: City } | undefined {
  const regions = [...locale.regions].sort((a, b) => Number(same(b.name, preferredRegion)) - Number(same(a.name, preferredRegion)));
  for (const region of regions) {
    const city = region.cities.find((candidate) => same(candidate.name, label));
    if (city) return { region, city };
  }
  return undefined;
}

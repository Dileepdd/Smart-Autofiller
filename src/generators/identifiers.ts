import { faker } from "@faker-js/faker";

/** Test data shaped like Indian identifiers. Nothing here is issued to anyone or checked against a registry. */
export interface IndianIdentifiers {
  aadhaar: string;
  pan: string;
  gstin: string;
  ifsc: string;
  upi: string;
  bankAccount: string;
  passport: string;
  voterId: string;
  drivingLicence: string;
}

const BANK_CODES = ["SBIN", "HDFC", "ICIC", "UTIB", "PUNB", "KKBK"];
const UPI_HANDLES = ["oksbi", "okhdfcbank", "okaxis", "okicici", "ybl", "paytm"];
const LICENCE_STATES = ["MH", "KA", "TN", "AP", "DL", "TS"];
/** Letters Indian passport numbers start with. */
const PASSPORT_SERIES = ["J", "K", "L", "M", "N", "P", "R", "S", "T", "U", "V", "W"];

const VERHOEFF_MULTIPLY = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];
const VERHOEFF_PERMUTE = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];
const VERHOEFF_INVERSE = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/** The check digit forms use to validate an Aadhaar number. */
export function verhoeffDigit(digits: string): string {
  const reversed = [...digits].reverse().map(Number);
  const check = reversed.reduce((sum, digit, index) => VERHOEFF_MULTIPLY[sum][VERHOEFF_PERMUTE[(index + 1) % 8][digit]], 0);
  return String(VERHOEFF_INVERSE[check]);
}

const digits = (length: number): string => faker.string.numeric(length);

const nonZeroDigit = (): string => faker.string.numeric({ length: 1, exclude: ["0"] });

function aadhaar(): string {
  // Aadhaar numbers never start with 0 or 1.
  const body = `${faker.string.numeric({ length: 1, exclude: ["0", "1"] })}${digits(10)}`;
  return `${body}${verhoeffDigit(body)}`;
}

/** The fourth letter marks an individual and the fifth is the holder's surname initial. */
function pan(lastName: string): string {
  const initial = /^[a-z]/i.test(lastName) ? lastName[0].toUpperCase() : "?";
  return faker.helpers.replaceSymbols(`???P${initial}####?`);
}

export function createIndianIdentifiers(lastName: string, emailLocalPart: string): IndianIdentifiers {
  const panNumber = pan(lastName);
  return {
    aadhaar: aadhaar(),
    pan: panNumber,
    gstin: `${faker.number.int({ min: 10, max: 37 })}${panNumber}1Z${digits(1)}`,
    ifsc: `${faker.helpers.arrayElement(BANK_CODES)}0${digits(6)}`,
    upi: `${emailLocalPart}@${faker.helpers.arrayElement(UPI_HANDLES)}`,
    bankAccount: `${nonZeroDigit()}${digits(11)}`,
    passport: `${faker.helpers.arrayElement(PASSPORT_SERIES)}${nonZeroDigit()}${digits(6)}`,
    voterId: faker.helpers.replaceSymbols("???#######"),
    drivingLicence: `${faker.helpers.arrayElement(LICENCE_STATES)}${digits(2)}${faker.number.int({ min: 2005, max: 2023 })}${digits(7)}`
  };
}

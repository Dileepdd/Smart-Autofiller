/**
 * Removes Latin accents so "Prénom", "Straße" and "Código" match the plain words "prenom",
 * "strasse" and "codigo". Only Latin combining marks go: the vowel signs of scripts such as
 * Devanagari are letters of their own and must stay.
 */
export const foldAccents = (value: string): string =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").normalize("NFC");

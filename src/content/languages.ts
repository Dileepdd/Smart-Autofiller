import type { FieldKind } from "./classifier";
import { CountryCode } from "../shared/types";

type Rule = readonly [FieldKind, RegExp];

interface LanguageRules {
  /** Words specific enough to trust on any page. */
  rules: readonly Rule[];
  /** Short words that mean something else in another language, trusted only when the page says it is in this one. */
  strict?: readonly Rule[];
}

/** Devanagari has no word boundary in JavaScript regular expressions, so words are found between the spaces labels are split on. */
const word = (pattern: string): RegExp => new RegExp(`(?:^| )(?:${pattern})(?: |$)`, "u");

/**
 * Field words in other languages, written without accents because labels are folded before they
 * are matched. The first match wins, so specific words sit above general ones, as in the English rules.
 */
export const LANGUAGE_RULES: Readonly<Record<string, LanguageRules>> = {
  de: {
    rules: [
      ["company", /\b(firmenname|firma|unternehmen)\b/],
      ["fullName", /\bvollstandiger name\b/],
      ["firstName", /\bvorname\b/],
      ["lastName", /\b(nachname|familienname)\b/],
      ["email", /\be ?mail ?adresse\b/],
      ["phone", /\b(telefon( ?nummer)?|handy( ?nummer)?|mobil( ?nummer)?|rufnummer)\b/],
      ["dateOfBirth", /\bgeburts ?(datum|tag)\b/],
      ["password", /\b(passwort|kennwort)\b/],
      ["zip", /\b(plz|postleitzahl)\b/],
      ["street", /\b(strasse( und hausnummer)?|hausnummer|anschrift)\b/],
      ["city", /\b(stadt|wohnort)\b/],
      ["state", /\bbundesland\b/],
      ["gender", /\b(geschlecht|anrede)\b/],
      ["message", /\b(nachricht|kommentar|bemerkung)\b/]
    ],
    strict: [["city", /\bort\b/], ["country", /\bland\b/]]
  },
  fr: {
    rules: [
      ["company", /\b(nom de (l )?(entreprise|societe)|entreprise|societe)\b/],
      ["fullName", /\bnom complet\b/],
      ["firstName", /\bprenom\b/],
      ["lastName", /\bnom de famille\b/],
      ["email", /\b(courriel|adresse e ?mail)\b/],
      ["phone", /\b(numero de telephone|portable)\b/],
      ["dateOfBirth", /\bdate de naissance\b/],
      ["password", /\bmot de passe\b/],
      ["zip", /\bcode postal\b/],
      ["street", /\brue\b/],
      ["city", /\bville\b/],
      ["state", /\bdepartement\b/],
      ["country", /\bpays\b/],
      ["gender", /\b(civilite|sexe)\b/],
      ["address", /\badresse\b/]
    ],
    strict: [["lastName", /\bnom\b/]]
  },
  es: {
    rules: [
      ["company", /\b(nombre de (la )?empresa|empresa|compania)\b/],
      ["fullName", /\bnombre completo\b/],
      ["lastName", /\bapellidos?\b/],
      ["firstName", /\bnombre\b/],
      ["email", /\bcorreo( electronico)?\b/],
      ["phone", /\b(telefono|movil|celular)\b/],
      ["dateOfBirth", /\bfecha de nacimiento\b/],
      ["password", /\bcontrasena\b/],
      ["zip", /\bcodigo postal\b/],
      ["street", /\b(direccion|calle|domicilio)\b/],
      ["city", /\b(ciudad|localidad|municipio)\b/],
      ["state", /\bprovincia\b/],
      ["country", /\bpais\b/],
      ["gender", /\b(sexo|genero)\b/],
      ["message", /\b(mensaje|comentarios?)\b/]
    ]
  },
  pt: {
    rules: [
      ["company", /\b(nome da empresa|empresa)\b/],
      ["fullName", /\bnome completo\b/],
      ["firstName", /\bprimeiro nome\b/],
      ["lastName", /\b(sobrenome|ultimo nome)\b/],
      ["phone", /\b(telefone|telemovel|celular)\b/],
      ["dateOfBirth", /\bdata de nascimento\b/],
      ["password", /\b(senha|palavra passe)\b/],
      ["zip", /\b(cep|codigo postal)\b/],
      ["street", /\b(morada|endereco)\b/],
      ["city", /\b(cidade|localidade|concelho)\b/],
      ["state", /\bdistrito\b/],
      ["gender", /\b(sexo|genero)\b/],
      ["message", /\bmensagem\b/]
    ],
    strict: [["lastName", /\bapelido\b/], ["fullName", /\bnome\b/], ["state", /\bestado\b/], ["country", /\bpais\b/]]
  },
  it: {
    rules: [
      ["company", /\b(nome (dell )?azienda|azienda|ragione sociale)\b/],
      ["fullName", /\bnome e cognome\b/],
      ["lastName", /\bcognome\b/],
      ["email", /\bposta elettronica\b/],
      ["phone", /\b(telefono|cellulare)\b/],
      ["dateOfBirth", /\bdata di nascita\b/],
      ["zip", /\bcodice postale\b/],
      ["street", /\bindirizzo\b/],
      ["city", /\b(citta|comune)\b/],
      ["state", /\b(provincia|regione)\b/],
      ["country", /\bpaese\b/],
      ["gender", /\b(sesso|genere)\b/],
      ["message", /\bmessaggio\b/]
    ],
    strict: [["firstName", /\bnome\b/], ["zip", /\bcap\b/]]
  },
  nl: {
    rules: [
      ["company", /\bbedrijfs? ?naam\b|\bbedrijf\b/],
      ["fullName", /\bvolledige naam\b/],
      ["firstName", /\bvoornaam\b/],
      ["lastName", /\bachternaam\b/],
      ["email", /\be ?mail ?adres\b/],
      ["phone", /\b(telefoon( ?nummer)?|mobiel( ?nummer)?)\b/],
      ["dateOfBirth", /\bgeboortedatum\b/],
      ["password", /\bwachtwoord\b/],
      ["street", /\b(straat( ?naam)?|huisnummer)\b/],
      ["city", /\b(woonplaats|plaats)\b/],
      ["state", /\bprovincie\b/],
      ["gender", /\bgeslacht\b/],
      ["message", /\b(bericht|opmerking)\b/]
    ],
    strict: [["address", /\badres\b/], ["country", /\bland\b/]]
  },
  hi: {
    rules: [
      ["firstName", word("पहला नाम")],
      ["lastName", word("उपनाम")],
      ["fullName", word("पूरा नाम|नाम")],
      ["email", word("ईमेल")],
      ["phone", word("फ़?ोन|मोबाइल")],
      ["dateOfBirth", word("जन्म तिथि")],
      ["password", word("पासवर्ड")],
      ["zip", word("पिन ?कोड")],
      ["city", word("शहर")],
      ["state", word("राज्य")],
      ["country", word("देश")],
      ["gender", word("लिंग")],
      ["address", word("पता")],
      ["message", word("संदेश")]
    ]
  }
};

/** The country whose data a page in this language should get. English is left to the Country setting. */
export const LANGUAGE_COUNTRIES: Readonly<Record<string, CountryCode>> = {
  de: "DE", fr: "FR", es: "ES", pt: "PT", it: "IT", nl: "NL", hi: "IN"
};

/** The page's own language, from `<html lang="de-AT">`, reduced to "de". */
export const pageLanguage = (document: Document): string =>
  (document.documentElement.getAttribute("lang") ?? "").trim().toLowerCase().split(/[-_]/)[0];

/** Every language's safe words, plus the strict words of the language the page declares. */
export function rulesFor(language: string): Rule[] {
  return Object.entries(LANGUAGE_RULES).flatMap(([code, { rules, strict = [] }]) => (code === language ? [...rules, ...strict] : rules));
}

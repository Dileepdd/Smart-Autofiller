import { de, fr } from "@faker-js/faker";
import { afterEach, describe, expect, it } from "vitest";
import { classifyField } from "../src/content/classifier";
import { dataCountry, withDataLanguage } from "../src/content/pageLanguage";
import { fillPage } from "../src/content/filler";
import { registerLocale } from "../src/generators/localeRegistry";
import { createProfile } from "../src/generators/profile";
import { findLocale, LOCALES } from "../src/generators/locales";
import { foldAccents } from "../src/shared/text";
import { find, render, settingsWith } from "./helpers";

const setLanguage = (lang: string | null): void => {
  if (lang === null) document.documentElement.removeAttribute("lang");
  else document.documentElement.setAttribute("lang", lang);
};

const kindOf = (label: string, lang: string | null = null): string => {
  setLanguage(lang);
  render(`<label for="field">${label}</label><input id="field">`);
  return classifyField(find<HTMLElement>("#field"));
};

afterEach(() => setLanguage(null));

describe("labels in other languages", () => {
  it.each([
    // German
    ["Vorname", "firstName"], ["Nachname", "lastName"], ["E-Mail-Adresse", "email"], ["Telefonnummer", "phone"],
    ["Geburtsdatum", "dateOfBirth"], ["Passwort", "password"], ["PLZ", "zip"], ["Postleitzahl", "zip"],
    ["Straße und Hausnummer", "street"], ["Stadt", "city"], ["Firmenname", "company"], ["Geschlecht", "gender"],
    // French
    ["Prénom", "firstName"], ["Nom de famille", "lastName"], ["Adresse e-mail", "email"], ["Date de naissance", "dateOfBirth"],
    ["Mot de passe", "password"], ["Code postal", "zip"], ["Ville", "city"], ["Pays", "country"], ["Nom de l'entreprise", "company"],
    // Spanish
    ["Nombre", "firstName"], ["Apellidos", "lastName"], ["Nombre completo", "fullName"], ["Correo electrónico", "email"],
    ["Teléfono", "phone"], ["Fecha de nacimiento", "dateOfBirth"], ["Contraseña", "password"], ["Código postal", "zip"],
    ["Ciudad", "city"], ["País", "country"], ["Nombre de la empresa", "company"],
    // Portuguese
    ["Nome completo", "fullName"], ["Sobrenome", "lastName"], ["Telefone", "phone"], ["Data de nascimento", "dateOfBirth"],
    ["Senha", "password"], ["CEP", "zip"], ["Cidade", "city"], ["Morada", "street"],
    // Italian
    ["Cognome", "lastName"], ["Data di nascita", "dateOfBirth"], ["Codice postale", "zip"], ["Città", "city"], ["Indirizzo", "street"],
    // Dutch
    ["Voornaam", "firstName"], ["Achternaam", "lastName"], ["E-mailadres", "email"], ["Telefoonnummer", "phone"],
    ["Geboortedatum", "dateOfBirth"], ["Wachtwoord", "password"], ["Postcode", "zip"], ["Woonplaats", "city"], ["Bedrijfsnaam", "company"],
    // Hindi
    ["पहला नाम", "firstName"], ["उपनाम", "lastName"], ["पूरा नाम", "fullName"], ["ईमेल", "email"], ["फ़ोन नंबर", "phone"],
    ["मोबाइल", "phone"], ["जन्म तिथि", "dateOfBirth"], ["पिन कोड", "zip"], ["शहर", "city"], ["राज्य", "state"]
  ])("reads %s as %s", (label, kind) => {
    expect(kindOf(label)).toBe(kind);
  });

  it("matches a label typed without its accents", () => {
    expect(kindOf("Prenom")).toBe("firstName");
    expect(kindOf("Strasse")).toBe("street");
  });

  it("reads an English page exactly as before", () => {
    expect(kindOf("First name", "en")).toBe("firstName");
    expect(kindOf("Name", "en")).toBe("fullName");
    expect(kindOf("Land line", "en")).not.toBe("country");
  });

  describe("words that mean something else in another language", () => {
    it("reads 'Nome' as a first name on an Italian page and a full name on a Portuguese one", () => {
      expect(kindOf("Nome", "it")).toBe("firstName");
      expect(kindOf("Nome", "pt-BR")).toBe("fullName");
    });

    it("reads 'Nom' as a surname only on a French page", () => {
      expect(kindOf("Nom", "fr")).toBe("lastName");
      expect(kindOf("Nom", null)).not.toBe("lastName");
    });

    it("reads 'Land' as a country only on a German or Dutch page", () => {
      expect(kindOf("Land", "de")).toBe("country");
      expect(kindOf("Land", "nl")).toBe("country");
      expect(kindOf("Land", null)).not.toBe("country");
    });

    it("reads 'CAP' as a postal code only on an Italian page", () => {
      expect(kindOf("CAP", "it")).toBe("zip");
      expect(kindOf("CAP", null)).not.toBe("zip");
    });
  });
});

describe("accent folding", () => {
  it.each([["Prénom", "Prenom"], ["Straße", "Strasse"], ["Código", "Codigo"], ["Città", "Citta"]])("folds %s to %s", (from, to) => {
    expect(foldAccents(from)).toBe(to);
  });

  it("keeps the vowel signs of Devanagari", () => {
    expect(foldAccents("पिन कोड")).toBe("पिन कोड".normalize("NFC"));
  });
});

describe("country data", () => {
  const PATTERNS: Record<string, { postal: RegExp; tax: RegExp }> = {
    DE: { postal: /^\d{5}$/, tax: /^DE\d{9}$/ },
    FR: { postal: /^\d{5}$/, tax: /^FR\d{11}$/ },
    ES: { postal: /^\d{5}$/, tax: /^\d{8}[A-Z]$/ },
    PT: { postal: /^\d{4}-\d{3}$/, tax: /^\d{9}$/ },
    IT: { postal: /^\d{5}$/, tax: /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/ },
    NL: { postal: /^\d{4} [A-Z]{2}$/, tax: /^NL\d{9}B01$/ }
  };

  it.each(Object.keys(PATTERNS))("gives %s a matching city, postal code, tax ID and phone", (code) => {
    for (let run = 0; run < 20; run++) {
      const profile = createProfile(settingsWith({ country: code as never, nameRegion: "country" }));
      const locale = LOCALES.find((entry) => entry.code === code)!;
      const city = locale.regions.flatMap((region) => region.cities.map((entry) => ({ region, entry }))).find(({ entry }) => entry.name === profile.city);
      expect(city?.entry.postalCode).toBe(profile.postalCode);
      expect(city?.region.name).toBe(profile.region);
      expect(profile.postalCode).toMatch(PATTERNS[code].postal);
      expect(profile.taxId).toMatch(PATTERNS[code].tax);
      expect(profile.currency).toBe("EUR");
      expect(profile.email).toMatch(/^[a-z0-9.]+@/);
    }
  });

  it.each([["Deutschland", "DE"], ["España", "ES"], ["Espana", "ES"], ["Nederland", "NL"], ["Holland", "NL"], ["Italia", "IT"]])("knows %s as %s", (name, code) => {
    expect(findLocale(name)?.code).toBe(code);
  });
});

describe("names in the page's language", () => {
  it("uses German names once the German data is loaded, with a plain ASCII email", () => {
    registerLocale("DE", { metadata: de.metadata!, person: de.person!, company: de.company! });
    const names = new Set(Object.values(de.person!.first_name!).flat());
    const profile = createProfile(settingsWith({ country: "DE", nameRegion: "country" }));
    expect(names.has(profile.firstName)).toBe(true);
    expect(profile.email).toMatch(/^[a-z0-9.]+@/);
  });

  it("still fills with English names when a language's data was not loaded", () => {
    const profile = createProfile(settingsWith({ country: "NL", nameRegion: "country" }));
    expect(profile.firstName).not.toBe("");
    expect(profile.postalCode).toMatch(/^\d{4} [A-Z]{2}$/);
  });

  it("gives French names for French", () => {
    registerLocale("FR", { metadata: fr.metadata!, person: fr.person!, company: fr.company! });
    const names = new Set(Object.values(fr.person!.first_name!).flat());
    expect(names.has(createProfile(settingsWith({ country: "FR", nameRegion: "country" })).firstName)).toBe(true);
  });
});

describe("data language setting", () => {
  it("follows the page's language by default", () => {
    setLanguage("de-AT");
    render("<input>");
    expect(dataCountry(settingsWith({ country: "IN" }), document)).toBe("DE");
  });

  it("prefers a country the page has already chosen over its language", () => {
    setLanguage("de");
    render('<label for="c">Land</label><select id="c"><option>Germany</option><option selected>France</option></select>');
    expect(dataCountry(settingsWith({ country: "IN" }), document)).toBe("FR");
  });

  it("falls back to the Country setting on an English page", () => {
    setLanguage("en-US");
    render("<input>");
    expect(dataCountry(settingsWith({ country: "IN" }), document)).toBe("IN");
    expect(withDataLanguage(settingsWith({ country: "IN", nameRegion: "IN" }), document).nameRegion).toBe("IN");
  });

  it("uses a chosen language whatever the page says", () => {
    setLanguage("de");
    render("<input>");
    const settings = withDataLanguage(settingsWith({ dataLanguage: "ES", country: "IN" }), document);
    expect(settings).toMatchObject({ country: "ES", nameRegion: "country" });
  });

  it("fills a German form end to end with German addresses", async () => {
    setLanguage("de");
    render(`
      <label for="plz">PLZ</label><input id="plz">
      <label for="ort">Ort</label><input id="ort">
      <label for="tel">Telefonnummer</label><input id="tel">`);

    await fillPage(withDataLanguage(settingsWith({ country: "IN" }), document));

    expect(find("#plz").value).toMatch(/^\d{5}$/);
    expect(LOCALES.find(({ code }) => code === "DE")!.regions.flatMap(({ cities }) => cities.map(({ name }) => name))).toContain(find("#ort").value);
    expect(find("#tel").value).toMatch(/^0151/);
  });
});

describe("dropdown options in other languages", () => {
  const OPTIONS: Record<string, [string, string]> = {
    German: ["Männlich", "Weiblich"],
    French: ["Homme", "Femme"],
    Spanish: ["Hombre", "Mujer"],
    Italian: ["Maschio", "Femmina"],
    Dutch: ["Man", "Vrouw"],
    Hindi: ["पुरुष", "महिला"],
    "German salutation": ["Herr", "Frau"],
    "French salutation": ["Monsieur", "Madame"],
    English: ["Male", "Female"]
  };

  it.each(Object.entries(OPTIONS))("picks the option for the generated person's gender in %s", async (_language, [male, female]) => {
    for (const gender of ["male", "female"] as const) {
      render(`<label for="g">Gender</label><select id="g"><option value="">Select</option><option>${female}</option><option>${male}</option></select>`);
      await fillPage(settingsWith({ gender }));
      expect(find<HTMLSelectElement>("#g").value).toBe(gender === "male" ? male : female);
    }
  });

  it("never takes Female for a male person because one word contains the other", async () => {
    render('<label for="g">Gender</label><select id="g"><option value="">Select</option><option>Female</option><option>Male</option></select>');
    await fillPage(settingsWith({ gender: "male" }));
    expect(find<HTMLSelectElement>("#g").value).toBe("Male");
  });
});

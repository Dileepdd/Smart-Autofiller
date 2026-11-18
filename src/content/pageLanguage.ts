import { findLocale } from "../generators/locales";
import { AutofillSettings, CountryCode } from "../shared/types";
import { classifyField } from "./classifier";
import { comboboxValue } from "./customDropdown";
import { collectFields, isCombobox, isSelect } from "./detector";
import { hasSelection } from "./dropdown";
import { LANGUAGE_COUNTRIES, pageLanguage } from "./languages";

/** Enough to find a country field on any real form, without classifying every field of a huge one. */
const MAX_DROPDOWNS = 60;

function shownCountry(element: HTMLElement): string {
  if (isSelect(element)) return hasSelection(element) ? element.options[element.selectedIndex].text.trim() : "";
  return comboboxValue(element);
}

/** A country the page has already chosen in one of its own dropdowns. */
function chosenCountry(document: Document): CountryCode | undefined {
  const dropdowns = collectFields(document).filter((element) => isSelect(element) || isCombobox(element)).slice(0, MAX_DROPDOWNS);
  for (const element of dropdowns) {
    if (classifyField(element) !== "country") continue;
    const locale = findLocale(shownCountry(element));
    if (locale) return locale.code;
  }
  return undefined;
}

/** What the page says about where its user lives: a country it has selected, then the language it is written in. */
export const pageCountry = (document: Document): CountryCode | undefined =>
  chosenCountry(document) ?? LANGUAGE_COUNTRIES[pageLanguage(document)];

/** The country whose data this fill uses. "Follow the page" falls back to the Country setting. */
export function dataCountry(settings: AutofillSettings, document: Document): CountryCode {
  if (settings.dataLanguage !== "page") return settings.dataLanguage;
  return pageCountry(document) ?? settings.country;
}

/** Settings for this page, with names and addresses from the country the page calls for. */
export function withDataLanguage(settings: AutofillSettings, document: Document): AutofillSettings {
  const country = settings.dataLanguage === "page" ? pageCountry(document) : settings.dataLanguage;
  return country ? { ...settings, country, nameRegion: "country" } : settings;
}

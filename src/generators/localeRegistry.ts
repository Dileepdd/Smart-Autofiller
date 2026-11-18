import type { LocaleDefinition } from "@faker-js/faker";
import { CountryCode } from "../shared/types";

/**
 * Name data for these countries is large, so each ships as its own file and is injected only
 * when a fill needs it. That keeps the page script small for everyone else.
 */
export const ON_DEMAND_COUNTRIES: readonly CountryCode[] = ["DE", "FR", "ES", "PT", "IT", "NL"];

export const needsLocaleFile = (code: unknown): code is CountryCode =>
  typeof code === "string" && ON_DEMAND_COUNTRIES.includes(code as CountryCode);

export const localeFile = (code: CountryCode): string => `locales/${code.toLowerCase()}.js`;

/** Scripts an extension injects into one page share this global, which the page itself cannot see. */
const KEY = "__smartAutofillLocales";
type Registry = Partial<Record<CountryCode, LocaleDefinition>>;
const registry = (): Registry => ((globalThis as Record<string, unknown>)[KEY] as Registry | undefined) ?? {};

/** Called by each language file that the build writes, with the parts of a Faker locale a fill uses. */
export function registerLocale(code: CountryCode, definition: LocaleDefinition): void {
  (globalThis as Record<string, unknown>)[KEY] = { ...registry(), [code]: definition };
}

export const registeredLocale = (code: CountryCode): LocaleDefinition | undefined => registry()[code];

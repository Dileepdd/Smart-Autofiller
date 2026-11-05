/** Profile values that can be used as {token} in rules and patterns. */
export const PROFILE_TOKENS = [
  "firstName", "middleName", "lastName", "fullName", "gender", "email", "username", "password",
  "jobTitle", "department", "age", "dateOfBirth", "experience", "company", "companySize", "domain",
  "website", "phone", "taxId", "gstin", "street", "addressLine2", "city", "region", "regionCode",
  "postalCode", "country", "countryCode", "currency", "employeeId", "customerId", "invoiceId"
] as const;

const TOKEN = /\{([^{}]*)\}/g;
const NUMBER_TOKEN = /^number:(\d+)-(\d+)$/;

const isKnownToken = (name: string): boolean => (PROFILE_TOKENS as readonly string[]).includes(name);

/** Explains what is wrong with a template, or returns undefined when it is valid. */
export function templateError(template: string): string | undefined {
  if (/[{}]/.test(template.replace(TOKEN, ""))) return `Unmatched brace in "${template}".`;
  for (const [, name] of template.matchAll(TOKEN)) {
    const range = NUMBER_TOKEN.exec(name);
    if (range && Number(range[1]) > Number(range[2])) return `{${name}} has its minimum above its maximum.`;
    if (!range && !isKnownToken(name)) return `Unknown token {${name}}. Numbers look like {number:1000-9999}.`;
  }
  return undefined;
}

export function renderTemplate(template: string, values: Record<string, string>, randomInt: (min: number, max: number) => number): string {
  return template.replace(TOKEN, (token, name: string) => {
    const range = NUMBER_TOKEN.exec(name);
    if (range) return String(randomInt(Number(range[1]), Number(range[2])));
    return values[name] ?? token;
  });
}

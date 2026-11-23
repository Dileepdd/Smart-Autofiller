import { cssAttr, xpathLiteral } from "./escape";
import { FieldLocator } from "./types";

/** How a field is found in a framework without label support: as CSS, or as XPath when only its label identifies it. */
export type PlainLocator = { by: "css"; value: string; fragile?: true } | { by: "xpath"; value: string } | { by: "name"; value: string } | { by: "id"; value: string };

/** Test attributes first, then name and id, then the label, then the CSS path. */
export function plainLocator(locator: FieldLocator): PlainLocator {
  if (locator.testAttr) return { by: "css", value: `[${locator.testAttr.attr}="${cssAttr(locator.testAttr.value)}"]` };
  if (locator.name) return { by: "name", value: locator.name };
  if (locator.id) return { by: "id", value: locator.id };
  if (locator.label) {
    const text = xpathLiteral(locator.label.text);
    if (locator.label.source === "aria") return { by: "xpath", value: `//*[@aria-label=${text}]` };
    if (locator.label.source === "for") return { by: "xpath", value: `//*[@id=//label[normalize-space()=${text}]/@for]` };
    return { by: "xpath", value: `//label[normalize-space()=${text}]//*[self::input or self::select or self::textarea]` };
  }
  return { by: "css", value: locator.css, fragile: true };
}

/** The same locator as CSS, for Cypress. A label-only field uses Cypress's own text search instead. */
export function cssLocator(plain: PlainLocator): string | undefined {
  if (plain.by === "css") return plain.value;
  if (plain.by === "name") return `[name="${cssAttr(plain.value)}"]`;
  if (plain.by === "id") return `[id="${cssAttr(plain.value)}"]`;
  return undefined;
}

export const FRAGILE_NOTE = "may break: no label, test id, name or stable id to find this field by";

/** An XPath for a list option by its text, for custom dropdowns. */
export const optionXpath = (text: string): string => `//*[@role='option'][normalize-space()=${xpathLiteral(text)}]`;

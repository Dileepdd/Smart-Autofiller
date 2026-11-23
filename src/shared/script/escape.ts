/** A single-quoted JavaScript or TypeScript string. */
export const jsString = (value: string): string =>
  `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\r?\n/g, "\\n").replace(/\r/g, "\\r")
    .split(String.fromCharCode(0x2028)).join("\\u2028").split(String.fromCharCode(0x2029)).join("\\u2029")}'`;

/** A double-quoted Python string. */
export const pyString = (value: string): string =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n").replace(/\r/g, "\\r")}"`;

/** A double-quoted Java string. */
export const javaString = (value: string): string =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n").replace(/\r/g, "\\r")}"`;

/** A value inside a double-quoted CSS attribute selector. */
export const cssAttr = (value: string): string => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/** An XPath string literal. XPath has no escapes, so text holding both quote kinds is built with concat(). */
export function xpathLiteral(value: string): string {
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"')) return `"${value}"`;
  return `concat(${value.split("'").map((part) => `'${part}'`).join(`, "'", `)})`;
}

/** Cypress's type() reads {braces} as key names, so a literal brace is written {{}. */
export const cypressTyped = (value: string): string => value.replace(/\{/g, "{{}");

/** A file-safe name from a page title or URL. */
export const fileStem = (value: string): string =>
  value.toLowerCase().replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "form";

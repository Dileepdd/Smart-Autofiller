import { cypressTyped, jsString } from "./escape";
import { jsCsvReader } from "./jsCsv";
import { cssLocator, FRAGILE_NOTE, plainLocator } from "./locate";
import { ScriptAction, ScriptGenerator, ScriptOptions } from "./types";

/** Cypress finds fields by CSS. A field known only by its label is found through the label's text. */
function locatorOf(action: ScriptAction): { code: string; note?: string } {
  const plain = plainLocator(action.locator);
  const css = cssLocator(plain);
  const note = plain.by === "css" && plain.fragile ? FRAGILE_NOTE : undefined;
  if (css) return { code: `cy.get(${jsString(css)})`, note };
  const label = action.locator.label!;
  if (label.source === "aria") return { code: `cy.get(${jsString(`[aria-label="${label.text.replace(/"/g, '\\"')}"]`)})` };
  if (label.source === "for" && label.id) return { code: `cy.get(${jsString(`[id="${label.id.replace(/"/g, '\\"')}"]`)})` };
  return { code: `cy.contains('label', ${jsString(label.text)}).find('input, select, textarea')` };
}

function valueOf(action: ScriptAction, dataDriven: boolean): string {
  if (action.secret) return "Cypress.env('TEST_PASSWORD')";
  if (dataDriven && action.column) return `row[${jsString(action.column)}]`;
  return jsString(action.value);
}

function step(action: ScriptAction, dataDriven: boolean): string[] {
  const { code, note } = locatorOf(action);
  const comment = note ? ` // ${note}` : "";
  const value = valueOf(action, dataDriven);
  switch (action.kind) {
    case "fill": {
      // type() treats {braces} as keys: a literal value is escaped here, and a row's value at run time.
      const typed = action.secret || (dataDriven && action.column) ? `${value}.replace(/{/g, '{{}')` : jsString(cypressTyped(action.value));
      return [`${code}.clear().type(${typed});${comment}`];
    }
    case "select": return [`${code}.select(${value});${comment}`];
    case "check":
    case "radio": return [`${code}.check();${comment}`];
    case "uncheck": return [`${code}.uncheck();${comment}`];
    case "customSelect": return [`${code}.click();${comment}`, `cy.contains('[role="option"]', ${value}).click();`];
  }
}

const lines = (actions: ScriptAction[], dataDriven: boolean): string[] => [
  ...(actions.some(({ secret }) => secret) ? ["// Set TEST_PASSWORD in cypress.env.json: passwords are never written into scripts."] : []),
  ...actions.flatMap((action) => step(action, dataDriven))
];

const indent = (text: string[], spaces: number): string => text.map((line) => `${" ".repeat(spaces)}${line}`).join("\n");

export const cypress: ScriptGenerator = {
  name: "Cypress",
  extension: "cy.js",
  steps: (actions) => lines(actions, false).join("\n"),
  file(actions: ScriptAction[], { url, csvName }: ScriptOptions): string {
    if (!csvName) {
      return `describe('form', () => {
  it('fills the form', () => {
    cy.visit(${jsString(url)});
${indent(lines(actions, false), 4)}
  });
});
`;
    }
    return `${jsCsvReader(false)}

describe('form', () => {
  it('fills the form with every dataset row', () => {
    // Put ${csvName} in cypress/fixtures.
    cy.readFile(${jsString(`cypress/fixtures/${csvName}`)}).then((text) => {
      readCsv(text).forEach((row) => {
        cy.visit(${jsString(url)});
${indent(lines(actions, true), 8)}
      });
    });
  });
});
`;
  }
};

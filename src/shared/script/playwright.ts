import { cssAttr, jsString } from "./escape";
import { FRAGILE_NOTE } from "./locate";
import { jsCsvReader } from "./jsCsv";
import { ScriptAction, ScriptGenerator, ScriptOptions } from "./types";

/** Playwright reads best by label, then by test id, then by attribute; a CSS path is the last resort. */
function locatorOf(action: ScriptAction): { code: string; note?: string } {
  const { label, testAttr, name, id, css } = action.locator;
  if (label) return { code: `page.getByLabel(${jsString(label.text)}, { exact: true })` };
  if (testAttr?.attr === "data-testid") return { code: `page.getByTestId(${jsString(testAttr.value)})` };
  if (testAttr) return { code: `page.locator(${jsString(`[${testAttr.attr}="${cssAttr(testAttr.value)}"]`)})` };
  if (name) return { code: `page.locator(${jsString(`[name="${cssAttr(name)}"]`)})` };
  if (id) return { code: `page.locator(${jsString(`[id="${cssAttr(id)}"]`)})` };
  return { code: `page.locator(${jsString(css)})`, note: FRAGILE_NOTE };
}

function valueOf(action: ScriptAction, dataDriven: boolean): string {
  if (action.secret) return "process.env.TEST_PASSWORD ?? ''";
  if (dataDriven && action.column) return `row[${jsString(action.column)}]`;
  return jsString(action.value);
}

function step(action: ScriptAction, dataDriven: boolean): string[] {
  const { code, note } = locatorOf(action);
  const value = valueOf(action, dataDriven);
  const comment = note ? ` // ${note}` : "";
  switch (action.kind) {
    case "fill": return [`await ${code}.fill(${value});${comment}`];
    case "select": return [`await ${code}.selectOption({ label: ${value} });${comment}`];
    case "check":
    case "radio": return [`await ${code}.check();${comment}`];
    case "uncheck": return [`await ${code}.uncheck();${comment}`];
    case "customSelect": return [
      `await ${code}.click();${comment}`,
      `await page.getByRole('option', { name: ${value}, exact: true }).click();`
    ];
  }
}

const lines = (actions: ScriptAction[], dataDriven: boolean): string[] => [
  ...(actions.some(({ secret }) => secret) ? ["// Set TEST_PASSWORD in your environment: passwords are never written into scripts."] : []),
  ...actions.flatMap((action) => step(action, dataDriven))
];

const indent = (text: string[], spaces: number): string => text.map((line) => `${" ".repeat(spaces)}${line}`).join("\n");

export const playwright: ScriptGenerator = {
  name: "Playwright",
  extension: "spec.ts",
  steps: (actions) => lines(actions, false).join("\n"),
  file(actions: ScriptAction[], { url, csvName }: ScriptOptions): string {
    if (!csvName) {
      return `import { test } from '@playwright/test';

test('fills the form', async ({ page }) => {
  await page.goto(${jsString(url)});
${indent(lines(actions, false), 2)}
});
`;
    }
    return `import { test } from '@playwright/test';
import { readFileSync } from 'node:fs';

${jsCsvReader(true)}

// Run from the folder that holds ${csvName}.
const rows = readCsv(readFileSync(${jsString(csvName)}, 'utf8'));

for (const [index, row] of rows.entries()) {
  test(\`fills the form with row \${index + 1}\`, async ({ page }) => {
    await page.goto(${jsString(url)});
${indent(lines(actions, true), 4)}
  });
}
`;
  }
};

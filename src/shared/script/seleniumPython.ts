import { pyString } from "./escape";
import { FRAGILE_NOTE, optionXpath, plainLocator } from "./locate";
import { ScriptAction, ScriptGenerator, ScriptOptions } from "./types";

const BY = { css: "By.CSS_SELECTOR", xpath: "By.XPATH", name: "By.NAME", id: "By.ID" } as const;

function find(action: ScriptAction): { code: string; note?: string } {
  const plain = plainLocator(action.locator);
  const note = plain.by === "css" && plain.fragile ? FRAGILE_NOTE : undefined;
  return { code: `wait.until(EC.element_to_be_clickable((${BY[plain.by]}, ${pyString(plain.value)})))`, note };
}

function valueOf(action: ScriptAction, dataDriven: boolean): string {
  if (action.secret) return 'os.environ.get("TEST_PASSWORD", "")';
  if (dataDriven && action.column) return `row[${pyString(action.column)}]`;
  return pyString(action.value);
}

function step(action: ScriptAction, dataDriven: boolean): string[] {
  const { code, note } = find(action);
  const value = valueOf(action, dataDriven);
  const comment = note ? [`# ${note}`] : [];
  switch (action.kind) {
    case "fill": return [...comment, `field = ${code}`, "field.clear()", `field.send_keys(${value})`];
    case "select": return [...comment, `Select(${code}).select_by_visible_text(${value})`];
    case "check": return [...comment, `field = ${code}`, "if not field.is_selected():", "    field.click()"];
    case "uncheck": return [...comment, `field = ${code}`, "if field.is_selected():", "    field.click()"];
    case "radio": return [...comment, `${code}.click()`];
    case "customSelect": return [
      ...comment,
      `${code}.click()`,
      dataDriven && action.column
        ? `wait.until(EC.element_to_be_clickable((By.XPATH, "//*[@role='option'][normalize-space()=" + xpath_literal(row[${pyString(action.column)}]) + "]"))).click()`
        : `wait.until(EC.element_to_be_clickable((By.XPATH, ${pyString(optionXpath(action.value))}))).click()`
    ];
  }
}

const lines = (actions: ScriptAction[], dataDriven: boolean): string[] => [
  ...(actions.some(({ secret }) => secret) ? ["# Set TEST_PASSWORD in your environment: passwords are never written into scripts."] : []),
  ...actions.flatMap((action) => step(action, dataDriven))
];

const indent = (text: string[], spaces: number): string => text.map((line) => `${" ".repeat(spaces)}${line}`).join("\n");

const IMPORTS = `import os
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.select import Select
from selenium.webdriver.support.ui import WebDriverWait`;

/** Written into data-driven files that pick list options by a row's text, which may hold quotes. */
const PY_XPATH_LITERAL = `

def xpath_literal(text):
    if "'" not in text:
        return "'" + text + "'"
    if '"' not in text:
        return '"' + text + '"'
    return "concat('" + text.replace("'", "', \"'\", '") + "')"
`;

export const seleniumPython: ScriptGenerator = {
  name: "Selenium (Python)",
  extension: "py",
  steps: (actions) => ["# Needs: driver, and wait = WebDriverWait(driver, 10)", ...lines(actions, false)].join("\n"),
  file(actions: ScriptAction[], { url, csvName }: ScriptOptions): string {
    const dataDriven = Boolean(csvName);
    return `${dataDriven ? "import csv\n" : ""}${IMPORTS}

URL = ${pyString(url)}
${dataDriven && actions.some(({ kind, column }) => kind === "customSelect" && column) ? PY_XPATH_LITERAL : ""}

def fill(driver, wait${dataDriven ? ", row" : ""}):
${indent(lines(actions, dataDriven), 4)}


def ${dataDriven ? "test_fills_the_form_with_every_row" : "test_fills_the_form"}():
    driver = webdriver.Chrome()
    try:
        wait = WebDriverWait(driver, 10)
${dataDriven
      ? `        # Run from the folder that holds ${csvName}.
        with open(${pyString(csvName!)}, newline="", encoding="utf-8-sig") as sheet:
            for row in csv.DictReader(sheet):
                driver.get(URL)
                fill(driver, wait, row)`
      : `        driver.get(URL)
        fill(driver, wait)`}
    finally:
        driver.quit()


if __name__ == "__main__":
    ${dataDriven ? "test_fills_the_form_with_every_row" : "test_fills_the_form"}()
`;
  }
};

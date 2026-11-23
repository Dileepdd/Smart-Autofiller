import { describe, expect, it } from "vitest";
import { fillPage } from "../src/content/filler";
import { lastScript } from "../src/content/script/actions";
import { locate } from "../src/content/script/selector";
import { cssAttr, cypressTyped, jsString, pyString, xpathLiteral } from "../src/shared/script/escape";
import { cypress } from "../src/shared/script/cypress";
import { playwright } from "../src/shared/script/playwright";
import { seleniumJava } from "../src/shared/script/seleniumJava";
import { seleniumPython } from "../src/shared/script/seleniumPython";
import { ScriptAction } from "../src/shared/script/types";
import { find, render, settingsWith } from "./helpers";

const field = (html: string): HTMLElement => {
  render(html);
  return find<HTMLElement>("#target");
};

describe("finding a field again", () => {
  it("prefers a unique label, and records where it comes from", () => {
    expect(locate(field('<label for="target">Email</label><input id="target">'), document).label).toEqual({ text: "Email", source: "for", id: "target" });
    expect(locate(field('<label>Name <input id="target"></label>'), document).label).toEqual({ text: "Name", source: "wrap" });
    expect(locate(field('<input id="target" aria-label="Search term">'), document).label).toEqual({ text: "Search term", source: "aria" });
  });

  it("leaves out a label two fields share", () => {
    render('<label>Phone <input id="target"></label><label>Phone <input></label>');
    expect(locate(find<HTMLElement>("#target"), document).label).toBeUndefined();
  });

  it("keeps test attributes, name and id only when unique", () => {
    const locator = locate(field('<input id="target" name="email" data-testid="email-input"><input name="other">'), document);
    expect(locator).toMatchObject({ testAttr: { attr: "data-testid", value: "email-input" }, name: "email", id: "target" });
    render('<input id="target" name="dup"><input name="dup">');
    expect(locate(find<HTMLElement>("#target"), document).name).toBeUndefined();
  });

  it.each([":r1:", "mui-12345", "radix-:r3:", "headlessui-input-7", "el-id-4512-3", "a8f3c9d2e1b4"])("skips the generated id %s", (id) => {
    render(`<input id="${id}" name="email">`);
    expect(locate(document.querySelector("input")!, document).id).toBeUndefined();
  });

  it("always has a CSS path to fall back on", () => {
    render('<form id="signup"><div><input><input id="target"></div></form>');
    expect(locate(find<HTMLElement>("#target"), document).css).toBe("#target");
    render('<form id="signup"><div><input><input class="x"></div></form>');
    expect(locate(document.querySelectorAll("input")[1] as HTMLElement, document).css).toBe("#signup > div > input:nth-of-type(2)");
  });
});

describe("escaping", () => {
  it("writes strings each language reads back exactly", () => {
    expect(jsString("it's a \\ path\nnext")).toBe("'it\\'s a \\\\ path\\nnext'");
    expect(pyString('say "hi"\\')).toBe('"say \\"hi\\"\\\\"');
    expect(cssAttr('a"b')).toBe('a\\"b');
    expect(cypressTyped("{enter} braces")).toBe("{{}enter} braces");
  });

  it("builds an XPath literal for text holding both kinds of quote", () => {
    expect(xpathLiteral("plain")).toBe("'plain'");
    expect(xpathLiteral("it's")).toBe(`"it's"`);
    expect(xpathLiteral(`it's "x"`)).toBe(`concat('it', "'", 's "x"')`);
  });
});

const ACTIONS: ScriptAction[] = [
  { kind: "fill", label: "Email", locator: { label: { text: "Email", source: "for", id: "email" }, name: "email", css: "#email" }, value: "asha@test.example", column: "Email" },
  { kind: "select", label: "Plan", locator: { testAttr: { attr: "data-testid", value: "plan" }, css: "select" }, value: "Basic" },
  { kind: "check", label: "Terms", locator: { id: "terms", css: "#terms" }, value: "true" },
  { kind: "radio", label: "Mobile", locator: { label: { text: "Mobile", source: "wrap" }, css: "input:nth-of-type(2)" }, value: "Mobile" },
  { kind: "customSelect", label: "Course", locator: { label: { text: "Course", source: "aria" }, css: "button" }, value: "BBA", column: "Course" },
  { kind: "fill", label: "Password", locator: { name: "password", css: "#pw" }, value: "", secret: true },
  { kind: "fill", label: "Notes", locator: { css: "div > input:nth-of-type(3)" }, value: "Line one\nit's {fine}" }
];

describe("Playwright", () => {
  const steps = playwright.steps(ACTIONS);

  it("reads by label and test id, with the right action for each field", () => {
    expect(steps).toContain("await page.getByLabel('Email', { exact: true }).fill('asha@test.example');");
    expect(steps).toContain("await page.getByTestId('plan').selectOption({ label: 'Basic' });");
    expect(steps).toContain(`await page.locator('[id="terms"]').check();`);
    expect(steps).toContain("await page.getByLabel('Mobile', { exact: true }).check();");
    expect(steps).toContain("await page.getByLabel('Course', { exact: true }).click();\nawait page.getByRole('option', { name: 'BBA', exact: true }).click();");
  });

  it("never writes a password, and marks a fragile selector", () => {
    expect(steps).toContain(`await page.locator('[name="password"]').fill(process.env.TEST_PASSWORD ?? '');`);
    expect(steps).toContain("// Set TEST_PASSWORD");
    expect(steps).toContain("fill('Line one\\nit\\'s {fine}'); // may break");
  });

  it("writes a full test, and a data-driven one reading the CSV", () => {
    expect(playwright.file(ACTIONS, { url: "https://app.test/signup" })).toContain("await page.goto('https://app.test/signup');");
    const data = playwright.file(ACTIONS, { url: "https://app.test/signup", csvName: "leads.csv" });
    expect(data).toContain("const rows = readCsv(readFileSync('leads.csv', 'utf8'));");
    expect(data).toContain("fill(row['Email'])");
    expect(data).toContain("name: row['Course']");
    expect(data).toContain("selectOption({ label: 'Basic' })");
    expect(data).toContain("function readCsv(text: string): Record<string, string>[]");
  });
});

describe("Cypress", () => {
  const steps = cypress.steps(ACTIONS);

  it("finds fields by CSS or label text and escapes braces for type()", () => {
    expect(steps).toContain(`cy.get('[name="email"]').clear().type('asha@test.example');`);
    expect(steps).toContain(`cy.get('[data-testid="plan"]').select('Basic');`);
    expect(steps).toContain("cy.contains('label', 'Mobile').find('input, select, textarea').check();");
    expect(steps).toContain(`cy.get('[aria-label="Course"]').click();\ncy.contains('[role="option"]', 'BBA').click();`);
    expect(steps).toContain("type('Line one\\nit\\'s {{}fine}')");
    expect(steps).toContain("Cypress.env('TEST_PASSWORD')");
  });

  it("reads rows from the fixtures folder in a data-driven test", () => {
    const data = cypress.file(ACTIONS, { url: "https://app.test", csvName: "leads.csv" });
    expect(data).toContain("cy.readFile('cypress/fixtures/leads.csv')");
    expect(data).toContain(`type(row['Email'].replace(/{/g, '{{}'))`);
  });
});

describe("Selenium", () => {
  it("writes Python with explicit waits and the right By for each locator", () => {
    const steps = seleniumPython.steps(ACTIONS);
    expect(steps).toContain('field = wait.until(EC.element_to_be_clickable((By.NAME, "email")))');
    expect(steps).toContain(`Select(wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "[data-testid=\\"plan\\"]")))).select_by_visible_text("Basic")`);
    expect(steps).toContain('os.environ.get("TEST_PASSWORD", "")');
    const data = seleniumPython.file(ACTIONS, { url: "https://app.test", csvName: "leads.csv" });
    expect(data).toContain("for row in csv.DictReader(sheet):");
    expect(data).toContain("def xpath_literal(text):");
    expect(data).toContain('field.send_keys(row["Email"])');
  });

  it("writes Java with a block per step and a CSV reader for data-driven tests", () => {
    const steps = seleniumJava.steps(ACTIONS);
    expect(steps).toContain('{ WebElement field = wait.until(ExpectedConditions.elementToBeClickable(By.name("email"))); field.clear(); field.sendKeys("asha@test.example"); }');
    expect(steps).toContain('System.getenv().getOrDefault("TEST_PASSWORD", "")');
    const data = seleniumJava.file(ACTIONS, { url: "https://app.test", csvName: "leads.csv" });
    expect(data).toContain("static List<Map<String, String>> readCsv(Path path)");
    expect(data).toContain("static String xpathLiteral(String text)");
    expect(data).toContain('row.getOrDefault("Email", "")');
    expect(data).toContain("class FillFormTest");
  });
});

describe("recording a fill", () => {
  it("records each filled field with its final value, and never a password", async () => {
    render(`
      <label for="email">Email</label><input id="email" name="email">
      <label for="pw">Password</label><input id="pw" type="password">
      <label for="plan">Plan</label><select id="plan"><option value="">Select</option><option>Basic</option></select>`);

    await fillPage(settingsWith());

    const { actions } = lastScript();
    expect(actions.find(({ label }) => label === "Email")).toMatchObject({ kind: "fill", value: find("#email").value });
    expect(actions.find(({ label }) => label === "Password")).toMatchObject({ kind: "fill", value: "", secret: true });
    expect(actions.find(({ label }) => label === "Plan")).toMatchObject({ kind: "select", value: "Basic" });
    expect(JSON.stringify(actions)).not.toContain(find("#pw").value);
  });

  it("notes which dataset column filled each field", async () => {
    render('<label for="email">Email</label><input id="email"><label for="city">City</label><input id="city">');

    await fillPage(settingsWith(), { headers: ["Email"], values: ["asha@test.example"], number: 1, total: 1 });

    const { actions } = lastScript();
    expect(actions.find(({ label }) => label === "Email")?.column).toBe("Email");
    expect(actions.find(({ label }) => label === "City")?.column).toBeUndefined();
  });
});

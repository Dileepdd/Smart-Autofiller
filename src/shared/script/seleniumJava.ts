import { javaString } from "./escape";
import { FRAGILE_NOTE, optionXpath, plainLocator } from "./locate";
import { ScriptAction, ScriptGenerator, ScriptOptions } from "./types";

const BY = { css: "By.cssSelector", xpath: "By.xpath", name: "By.name", id: "By.id" } as const;

function find(action: ScriptAction): { code: string; note?: string } {
  const plain = plainLocator(action.locator);
  const note = plain.by === "css" && plain.fragile ? FRAGILE_NOTE : undefined;
  return { code: `wait.until(ExpectedConditions.elementToBeClickable(${BY[plain.by]}(${javaString(plain.value)})))`, note };
}

function valueOf(action: ScriptAction, dataDriven: boolean): string {
  if (action.secret) return 'System.getenv().getOrDefault("TEST_PASSWORD", "")';
  if (dataDriven && action.column) return `row.getOrDefault(${javaString(action.column)}, "")`;
  return javaString(action.value);
}

/** Each step is a block, so its variable names never clash with the next step's. */
function step(action: ScriptAction, dataDriven: boolean): string[] {
  const { code, note } = find(action);
  const value = valueOf(action, dataDriven);
  const comment = note ? [`// ${note}`] : [];
  switch (action.kind) {
    case "fill": return [...comment, `{ WebElement field = ${code}; field.clear(); field.sendKeys(${value}); }`];
    case "select": return [...comment, `new Select(${code}).selectByVisibleText(${value});`];
    case "check": return [...comment, `{ WebElement field = ${code}; if (!field.isSelected()) field.click(); }`];
    case "uncheck": return [...comment, `{ WebElement field = ${code}; if (field.isSelected()) field.click(); }`];
    case "radio": return [...comment, `${code}.click();`];
    case "customSelect": return [
      ...comment,
      `${code}.click();`,
      dataDriven && action.column
        ? `wait.until(ExpectedConditions.elementToBeClickable(By.xpath("//*[@role='option'][normalize-space()=" + xpathLiteral(row.getOrDefault(${javaString(action.column)}, "")) + "]"))).click();`
        : `wait.until(ExpectedConditions.elementToBeClickable(By.xpath(${javaString(optionXpath(action.value))}))).click();`
    ];
  }
}

const lines = (actions: ScriptAction[], dataDriven: boolean): string[] => [
  ...(actions.some(({ secret }) => secret) ? ["// Set TEST_PASSWORD in your environment: passwords are never written into scripts."] : []),
  ...actions.flatMap((action) => step(action, dataDriven))
];

const indent = (text: string[], spaces: number): string => text.map((line) => `${" ".repeat(spaces)}${line}`).join("\n");

const JAVA_CSV_READER = `    /** Reads CSV into one map per row, keyed by the header row. Quoted cells may hold commas, quotes and line breaks. */
    static List<Map<String, String>> readCsv(Path path) throws IOException {
        String text = Files.readString(path, StandardCharsets.UTF_8).replace("\\uFEFF", "");
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (quoted) {
                if (c == '"' && i + 1 < text.length() && text.charAt(i + 1) == '"') { cell.append('"'); i++; }
                else if (c == '"') quoted = false;
                else cell.append(c);
            } else if (c == '"' && cell.length() == 0) quoted = true;
            else if (c == ',') { row.add(cell.toString()); cell.setLength(0); }
            else if (c == '\\n' || c == '\\r') {
                if (c == '\\r' && i + 1 < text.length() && text.charAt(i + 1) == '\\n') i++;
                row.add(cell.toString()); rows.add(row); row = new ArrayList<>(); cell.setLength(0);
            } else cell.append(c);
        }
        if (cell.length() > 0 || !row.isEmpty()) { row.add(cell.toString()); rows.add(row); }
        rows.removeIf(r -> r.stream().allMatch(String::isEmpty));
        List<String> headers = rows.remove(0);
        List<Map<String, String>> result = new ArrayList<>();
        for (List<String> values : rows) {
            Map<String, String> entry = new LinkedHashMap<>();
            for (int i = 0; i < headers.size(); i++) entry.put(headers.get(i), i < values.size() ? values.get(i) : "");
            result.add(entry);
        }
        return result;
    }`;

/** Written into data-driven files that pick list options by a row's text, which may hold quotes. */
const JAVA_XPATH_LITERAL = `    /** An XPath string literal for text that may hold quotes. */
    static String xpathLiteral(String text) {
        if (!text.contains("'")) return "'" + text + "'";
        if (!text.contains("\\"")) return "\\"" + text + "\\"";
        return "concat('" + text.replace("'", "', \\"'\\", '") + "')";
    }`;

export const seleniumJava: ScriptGenerator = {
  name: "Selenium (Java)",
  extension: "java",
  steps: (actions) => ["// Needs: driver, and wait = new WebDriverWait(driver, Duration.ofSeconds(10))", ...lines(actions, false)].join("\n"),
  file(actions: ScriptAction[], { url, csvName }: ScriptOptions): string {
    const dataDriven = Boolean(csvName);
    const extraImports = dataDriven
      ? "import java.io.IOException;\nimport java.nio.charset.StandardCharsets;\nimport java.nio.file.Files;\nimport java.nio.file.Path;\nimport java.util.ArrayList;\nimport java.util.LinkedHashMap;\nimport java.util.List;\n"
      : "";
    return `import java.time.Duration;
${extraImports}import java.util.Map;
import org.junit.jupiter.api.Test;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.Select;
import org.openqa.selenium.support.ui.WebDriverWait;

class FillFormTest {
    static final String URL = ${javaString(url)};

    static void fill(WebDriver driver, WebDriverWait wait, Map<String, String> row) {
${indent(lines(actions, dataDriven), 8)}
    }

    @Test
    void ${dataDriven ? "fillsTheFormWithEveryRow() throws IOException" : "fillsTheForm()"} {
        WebDriver driver = new ChromeDriver();
        try {
            WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(10));
${dataDriven
      ? `            // Run from the folder that holds ${csvName}.
            for (Map<String, String> row : readCsv(Path.of(${javaString(csvName!)}))) {
                driver.get(URL);
                fill(driver, wait, row);
            }`
      : `            driver.get(URL);
            fill(driver, wait, Map.of());`}
        } finally {
            driver.quit();
        }
    }
${dataDriven ? `\n${JAVA_CSV_READER}\n\n${JAVA_XPATH_LITERAL}\n` : ""}}
`;
  }
};

import { crc32, deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { isoDate, isTruthy } from "../src/content/datasetMatch";
import { fillPage } from "../src/content/filler";
import { parseCsv, toCsv } from "../src/shared/csv";
import { appendRow, buildDataset, chooseRow, DatasetRow, MAX_COLUMNS } from "../src/shared/dataset";
import { parseXlsx } from "../src/shared/xlsx";
import { find, render, settingsWith } from "./helpers";

/** A minimal .xlsx: a zip of the XML parts Excel writes, each deflated. */
function xlsx(parts: Record<string, string>): ArrayBuffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const field = (size: number, value: number): Buffer => { const buffer = Buffer.alloc(size); buffer.writeUIntLE(value, 0, size); return buffer; };
  for (const [path, text] of Object.entries(parts)) {
    const name = Buffer.from(path);
    const data = Buffer.from(text);
    const deflated = deflateRawSync(data);
    const shared = [field(2, 20), field(2, 0), field(2, 8), field(2, 0), field(2, 0x21), field(4, crc32(data)), field(4, deflated.length), field(4, data.length), field(2, name.length), field(2, 0)];
    const local = Buffer.concat([field(4, 0x04034b50), ...shared, name, deflated]);
    centrals.push(Buffer.concat([field(4, 0x02014b50), field(2, 20), ...shared, field(2, 0), field(2, 0), field(2, 0), field(4, 0), field(4, offset), name]));
    locals.push(local);
    offset += local.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.concat([field(4, 0x06054b50), field(2, 0), field(2, 0), field(2, centrals.length), field(2, centrals.length), field(4, directory.length), field(4, offset), field(2, 0)]);
  const file = Buffer.concat([...locals, directory, end]);
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
}

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const WORKBOOK = {
  "xl/workbook.xml": `<workbook ${NS}><sheets><sheet name="Leads" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  "xl/_rels/workbook.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="x"/></Relationships>',
  "xl/sharedStrings.xml": `<sst ${NS}><si><t>First Name</t></si><si><t>Joined</t></si><si><t>Amount</t></si><si><t>Asha</t></si><si><r><t>Rich </t></r><r><t>text</t></r></si></sst>`,
  "xl/styles.xml": `<styleSheet ${NS}><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`
};

describe("CSV", () => {
  it("reads quoted cells with separators, quotes and line breaks, and a byte-order mark", () => {
    expect(parseCsv('﻿Name,Notes\r\n"Rao, Asha","Said ""hi""\nthen left"\r\nRavi,')).toEqual([
      ["Name", "Notes"], ["Rao, Asha", 'Said "hi"\nthen left'], ["Ravi", ""]
    ]);
  });

  it.each([["semicolons", "a;b\n1;2"], ["tabs", "a\tb\n1\t2"]])("detects %s as the separator", (_name, text) => {
    expect(parseCsv(text)).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("writes CSV that reads back the same", () => {
    const rows = [["Name", "Notes"], ["Rao, Asha", 'Said "hi"\nthen left'], ["  padded", ""]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe("Excel", () => {
  it("reads shared and inline text, numbers, booleans, dates, gaps and rich text from the first sheet", async () => {
    const sheet = `<worksheet ${NS}><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="s"><v>2</v></c></row>
      <row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" s="1"><v>46339</v></c><c r="D2"><v>1250.5</v></c></row>
      <row r="3"><c r="A3" t="inlineStr"><is><t>Ravi</t></is></c><c r="C3" t="b"><v>1</v></c><c r="D3" t="s"><v>4</v></c></row>
    </sheetData></worksheet>`;
    const rows = await parseXlsx(xlsx({ ...WORKBOOK, "xl/worksheets/sheet1.xml": sheet }));
    expect(rows).toEqual([
      ["First Name", "Joined", "", "Amount"],
      ["Asha", "2026-11-13", "", "1250.5"],
      ["Ravi", "", "TRUE", "Rich text"]
    ]);
  });

  it("explains a file that is not a workbook", async () => {
    await expect(parseXlsx(new TextEncoder().encode("not a zip").buffer)).rejects.toThrow("not a valid Excel workbook");
  });
});

describe("building a dataset", () => {
  it("names blank headers, numbers repeated ones, pads short rows and drops empty ones", () => {
    const dataset = buildDataset("leads.csv", [["Name", "", "Name"], ["Asha", "x"], ["", "", ""], ["Ravi", "y", "z"]]);
    expect(dataset).toMatchObject({ headers: ["Name", "Column 2", "Name 2"], rows: [["Asha", "x", ""], ["Ravi", "y", "z"]] });
  });

  it("needs a header row and at least one row of data", () => {
    expect(buildDataset("x.csv", [["Name"]])).toEqual({ error: "The file needs a header row and at least one row of data." });
  });

  it("refuses more columns than supported", () => {
    const wide = [Array.from({ length: MAX_COLUMNS + 1 }, (_, index) => `C${index}`), ["1"]];
    expect(buildDataset("x.csv", wide)).toEqual({ error: `The file has ${MAX_COLUMNS + 1} columns. Up to ${MAX_COLUMNS} are supported.` });
  });
});

describe("choosing rows", () => {
  const start = { next: 0, last: null };

  it("moves to the next row on each fill", () => {
    const first = chooseRow(3, start, "auto", "next", "loop");
    expect(first).toEqual({ index: 0, cursor: { next: 1, last: 0 } });
  });

  it("starts again from row 1 after the last row, or stops, as chosen", () => {
    expect(chooseRow(3, { next: 3, last: 2 }, "auto", "next", "loop")).toEqual({ index: 0, cursor: { next: 1, last: 0 } });
    expect(chooseRow(3, { next: 3, last: 2 }, "auto", "next", "stop")).toEqual({ exhausted: true });
  });

  it("refills the row used last when asked for the same row", () => {
    expect(chooseRow(3, { next: 2, last: 1 }, "same", "next", "loop")).toEqual({ index: 1, cursor: { next: 2, last: 1 } });
    expect(chooseRow(3, start, "same", "next", "loop")).toEqual({ index: 0, cursor: { next: 0, last: 0 } });
  });

  it("picks any row in random order without moving the cursor", () => {
    expect(chooseRow(10, { next: 4, last: null }, "auto", "random", "stop", () => 0.75)).toEqual({ index: 7, cursor: { next: 4, last: 7 } });
  });

  it("lets the menu's next row ignore a same-row setting", () => {
    expect(chooseRow(3, { next: 1, last: 0 }, "next", "same", "loop")).toEqual({ index: 1, cursor: { next: 2, last: 1 } });
  });
});

describe("saving a form as a row", () => {
  it("starts a dataset, then matches columns by name and adds new ones", () => {
    const first = appendRow(undefined, [{ field: "Name", value: "Asha" }, { field: "Email", value: "a@x.test" }]);
    const second = appendRow(first, [{ field: "email", value: "r@x.test" }, { field: "City", value: "Pune" }]);
    expect(second.headers).toEqual(["Name", "Email", "City"]);
    expect(second.rows).toEqual([["Asha", "a@x.test", ""], ["", "r@x.test", "Pune"]]);
  });
});

describe("cell values", () => {
  it.each([["yes", true], ["TRUE", true], ["x", true], ["Ja", true], ["no", false], ["", false], ["0", false]])("reads %s as ticked: %s", (value, ticked) => {
    expect(isTruthy(value)).toBe(ticked);
  });

  it("turns typed dates into the form a date field accepts, in the chosen order", () => {
    expect(isoDate("25/12/2026", "DD/MM/YYYY")).toBe("2026-12-25");
    expect(isoDate("12/25/2026", "MM/DD/YYYY")).toBe("2026-12-25");
    expect(isoDate("2026-12-25", "DD/MM/YYYY")).toBe("2026-12-25");
  });
});

describe("filling from a row", () => {
  const row = (headers: string[], values: string[]): DatasetRow => ({ headers, values, number: 4, total: 50 });

  it("fills by exact label, then by kind, then by containing words, longest header first", async () => {
    render(`
      <label for="source">Lead Source</label><input id="source">
      <label for="mail">Your e-mail</label><input id="mail">
      <label for="company">Company Name</label><input id="company">
      <label for="other">Other notes</label><input id="other">`);

    const result = await fillPage(settingsWith(), row(["Lead Source", "Email", "Name", "Company Name"], ["Walk-in", "asha@test.example", "Asha Rao", "Acme Labs"]));

    expect(find("#source").value).toBe("Walk-in");
    expect(find("#mail").value).toBe("asha@test.example");
    expect(find("#company").value).toBe("Acme Labs");
    expect(find("#other").value).not.toBe("");
    expect(result.datasetRow).toEqual({ number: 4, total: 50 });
  });

  it("writes the sheet's values as they are, even in a test data mode", async () => {
    render('<label for="mail">Email</label><input id="mail"><label for="city">City</label><input id="city">');

    await fillPage(settingsWith({ dataMode: "invalid" }), row(["Email"], ["asha@test.example"]));

    expect(find("#mail").value).toBe("asha@test.example");
    expect(find("#city").value).not.toBe("");
  });

  it("picks dropdown and radio options by the cell, and reports a value no option has instead of guessing", async () => {
    render(`
      <label for="stage">Lead Stage</label><select id="stage"><option value="">Select</option><option>New</option><option>Contacted</option></select>
      <label for="plan">Plan</label><select id="plan"><option value="">Select</option><option>Basic</option></select>
      <fieldset><legend>Upload type</legend><label><input type="radio" name="upload" value="email">Email</label><label><input type="radio" name="upload" value="mobile">Mobile</label></fieldset>`);

    const result = await fillPage(settingsWith(), row(["Lead Stage", "Plan", "Upload type"], ["contacted", "Premium", "Mobile"]));

    expect(find<HTMLSelectElement>("#stage").value).toBe("Contacted");
    expect(find<HTMLSelectElement>("#plan").value).toBe("");
    expect(find<HTMLInputElement>("input[value=mobile]").checked).toBe(true);
    expect(result.details.join("\n")).toContain("No option matches the dataset value");
  });

  it("never pairs a radio option labelled Email with the sheet's Email column", async () => {
    render(`
      <fieldset><legend>Upload type</legend><label><input type="radio" name="upload" value="email">Email</label><label><input type="radio" name="upload" value="mobile">Mobile</label></fieldset>
      <label for="mail">Email address</label><input id="mail">`);

    const result = await fillPage(settingsWith(), row(["Email"], ["asha@test.example"]));

    expect(find("#mail").value).toBe("asha@test.example");
    expect(result.details.join(" | ")).not.toContain("No option matches");
    expect(document.querySelector("input[name=upload]:checked")).not.toBeNull();
  });

  it("ticks and unticks boxes as the sheet says", async () => {
    render('<label><input type="checkbox" id="news" checked> Newsletter</label><label><input type="checkbox" id="terms"> Terms</label>');

    await fillPage(settingsWith({ fillExisting: true }), row(["Newsletter", "Terms"], ["no", "yes"]));

    expect(find<HTMLInputElement>("#news").checked).toBe(false);
    expect(find<HTMLInputElement>("#terms").checked).toBe(true);
  });

  it("fills a blank cell's field with generated data, or leaves it alone, as chosen", async () => {
    const html = '<label for="mail">Email</label><input id="mail" value="kept@test.example">';
    render(html);
    await fillPage(settingsWith({ fillExisting: true, datasetBlank: "empty" }), row(["Email"], [""]));
    expect(find("#mail").value).toBe("kept@test.example");

    render(html);
    await fillPage(settingsWith({ fillExisting: true, datasetBlank: "generate" }), row(["Email"], [""]));
    expect(find("#mail").value).not.toBe("kept@test.example");
  });

  it("keeps generated fields in step with the sheet: the email follows its names, the ZIP code its city", async () => {
    render('<label for="mail">Email</label><input id="mail"><label for="zip">PIN code</label><input id="zip">');

    await fillPage(settingsWith({ country: "IN", emailDomain: "qa.test" }), row(["First Name", "Last Name", "City"], ["Meera", "Iyer", "Pune"]));

    expect(find("#mail").value).toBe("meera.iyer@qa.test");
    expect(find("#zip").value).toBe("411001");
  });

  it("fills a date field from a typed date", async () => {
    render('<label for="joined">Joining date</label><input id="joined" type="date">');

    await fillPage(settingsWith({ dateFormat: "DD/MM/YYYY" }), row(["Joining date"], ["25/12/2026"]));

    expect(find("#joined").value).toBe("2026-12-25");
  });
});

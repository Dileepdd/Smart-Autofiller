/**
 * Reads the first sheet of an .xlsx file with what the browser already has: an .xlsx is a zip of XML
 * files, unzipped here with DecompressionStream and read with DOMParser. No library is needed.
 * Each cell gives its saved value: a formula gives its last result, and a date becomes YYYY-MM-DD.
 */

const SHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** Excel's built-in number formats that are dates or times. */
const BUILT_IN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

interface ZipEntry { method: number; compressedSize: number; offset: number }

function readZipDirectory(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error("This file is not a valid Excel workbook.");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const entries = new Map<string, ZipEntry>();
  const decoder = new TextDecoder();
  for (let index = 0; index < count; index++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error("This file is not a valid Excel workbook.");
    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    entries.set(decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)), { method, compressedSize, offset });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function readEntry(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
  const data = bytes.slice(start, start + entry.compressedSize);
  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) throw new Error("This Excel file uses a compression this reader does not support. Save it as CSV instead.");
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

const parseXml = (text: string): Document => new DOMParser().parseFromString(text, "application/xml");
const children = (node: ParentNode, name: string): Element[] => Array.from(node.querySelectorAll(name)).filter((element) => element.localName === name);

/** "C12" to its zero-based column, 2. */
function columnIndex(reference: string): number {
  const letters = reference.replace(/\d+$/, "");
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

/** Excel counts days from 1900, with its famous leap-year bug, so day 60 is skipped. */
function excelDate(serial: number): string {
  const days = Math.floor(serial);
  const date = new Date(Date.UTC(1899, 11, 30) + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

function dateStyles(stylesXml: string | undefined): Set<number> {
  if (!stylesXml) return new Set();
  const styles = parseXml(stylesXml);
  const customDates = new Set(children(styles, "numFmt")
    .filter((format) => /[dmy]/i.test((format.getAttribute("formatCode") ?? "").replace(/"[^"]*"|\[[^\]]*\]/g, "")))
    .map((format) => Number(format.getAttribute("numFmtId"))));
  const cellXfs = children(styles, "cellXfs")[0];
  if (!cellXfs) return new Set();
  const styleIds = new Set<number>();
  children(cellXfs, "xf").forEach((xf, index) => {
    const format = Number(xf.getAttribute("numFmtId"));
    if (BUILT_IN_DATE_FORMATS.has(format) || customDates.has(format)) styleIds.add(index);
  });
  return styleIds;
}

const textOf = (node: Element): string => children(node, "t").map((part) => part.textContent ?? "").join("");

export async function parseXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const bytes = new Uint8Array(buffer);
  const entries = readZipDirectory(bytes);
  const read = async (name: string): Promise<string | undefined> => {
    const entry = entries.get(name);
    return entry ? readEntry(bytes, entry) : undefined;
  };

  const workbookXml = await read("xl/workbook.xml");
  if (!workbookXml) throw new Error("This file is not a valid Excel workbook.");
  const firstSheet = children(parseXml(workbookXml), "sheet")[0];
  const relationId = firstSheet?.getAttributeNS(REL_NS, "id") ?? firstSheet?.getAttribute("r:id");
  const relations = parseXml((await read("xl/_rels/workbook.xml.rels")) ?? "<Relationships/>");
  const target = children(relations, "Relationship").find((relation) => relation.getAttribute("Id") === relationId)?.getAttribute("Target") ?? "worksheets/sheet1.xml";
  const sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  const sheetXml = await read(sheetPath);
  if (!sheetXml) throw new Error("The workbook's first sheet could not be read.");

  const sharedXml = await read("xl/sharedStrings.xml");
  const shared = sharedXml ? children(parseXml(sharedXml), "si").map(textOf) : [];
  const dates = dateStyles(await read("xl/styles.xml"));

  const sheet = parseXml(sheetXml);
  if (sheet.documentElement.namespaceURI !== SHEET_NS && !sheet.documentElement.localName.endsWith("worksheet")) {
    throw new Error("The workbook's first sheet could not be read.");
  }
  return children(sheet, "row").map((rowNode) => {
    const row: string[] = [];
    children(rowNode, "c").forEach((cellNode, position) => {
      const reference = cellNode.getAttribute("r");
      const column = reference ? columnIndex(reference) : position;
      const type = cellNode.getAttribute("t");
      const raw = children(cellNode, "v")[0]?.textContent ?? "";
      let value: string;
      if (type === "s") value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") value = children(cellNode, "is").map(textOf).join("");
      else if (type === "b") value = raw === "1" ? "TRUE" : "FALSE";
      else if (type === "str" || type === "e") value = raw;
      else if (raw !== "" && dates.has(Number(cellNode.getAttribute("s")))) value = excelDate(Number(raw));
      else value = raw;
      while (row.length < column) row.push("");
      row[column] = value;
    });
    return row;
  });
}

import { parseCsv, toCsv } from "./csv";
import { DatasetAtEnd, DatasetOrder } from "./types";
import { parseXlsx } from "./xlsx";

const DATA_KEY = "smartAutofillDataset";
const CURSOR_KEY = "smartAutofillDatasetCursor";

export const MAX_ROWS = 5000;
export const MAX_COLUMNS = 100;
const MAX_CELL_LENGTH = 2000;

export interface Dataset {
  name: string;
  headers: string[];
  rows: string[][];
  importedAt: string;
}

/** Which row comes next, and which row the last dataset fill used. */
export interface DatasetCursor {
  next: number;
  last: number | null;
}

/** One row, as sent to the page: only this, never the whole sheet. */
export interface DatasetRow {
  headers: string[];
  values: string[];
  number: number;
  total: number;
}

export type RowRequest = "auto" | "next" | "same";

const clean = (cell: unknown): string => String(cell ?? "").replace(/\r\n?/g, "\n").trim().slice(0, MAX_CELL_LENGTH);

/** The first row names the columns. Empty rows are dropped, blank headers named, and repeated ones numbered. */
export function buildDataset(name: string, table: string[][]): Dataset | { error: string } {
  const rows = table.map((row) => row.map(clean)).filter((row) => row.some(Boolean));
  if (rows.length < 2) return { error: "The file needs a header row and at least one row of data." };
  const width = Math.max(...rows.map((row) => row.length));
  if (width > MAX_COLUMNS) return { error: `The file has ${width} columns. Up to ${MAX_COLUMNS} are supported.` };
  if (rows.length - 1 > MAX_ROWS) return { error: `The file has ${rows.length - 1} rows. Up to ${MAX_ROWS} are supported.` };

  const seen = new Map<string, number>();
  const headers = Array.from({ length: width }, (_, index) => {
    const header = rows[0][index] || `Column ${index + 1}`;
    const count = (seen.get(header.toLowerCase()) ?? 0) + 1;
    seen.set(header.toLowerCase(), count);
    return count > 1 ? `${header} ${count}` : header;
  });
  const data = rows.slice(1).map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ""));
  return { name, headers, rows: data, importedAt: new Date().toISOString() };
}

/** Reads an uploaded .csv or .xlsx file. A spreadsheet saved in the older .xls format is refused with advice. */
export async function readDatasetFile(file: File): Promise<Dataset | { error: string }> {
  const name = file.name;
  try {
    if (/\.xlsx$/i.test(name)) return buildDataset(name, await parseXlsx(await file.arrayBuffer()));
    if (/\.xls$/i.test(name)) return { error: "Old .xls files are not supported. Save the sheet as .xlsx or .csv." };
    return buildDataset(name, parseCsv(await file.text()));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The file could not be read." };
  }
}

/**
 * Picks the row for a fill, and where the cursor moves after it. Pure, so the rules are easy to test.
 * "auto" follows the chosen order; the right-click menu asks for the next row or the same row directly.
 */
export function chooseRow(total: number, cursor: DatasetCursor, request: RowRequest, order: DatasetOrder, atEnd: DatasetAtEnd, random = Math.random): { index: number; cursor: DatasetCursor } | { exhausted: true } {
  const mode = request === "auto" ? order : request;
  if (mode === "same") {
    const index = Math.min(cursor.last ?? cursor.next, total - 1);
    return { index: Math.max(index, 0), cursor: { next: cursor.next, last: Math.max(index, 0) } };
  }
  if (mode === "random") {
    const index = Math.floor(random() * total);
    return { index, cursor: { next: cursor.next, last: index } };
  }
  let index = cursor.next;
  if (index >= total) {
    if (atEnd === "stop") return { exhausted: true };
    index = 0;
  }
  return { index, cursor: { next: index + 1, last: index } };
}

/**
 * Adds a captured form as a row. Columns are matched by name, ignoring case; a field the sheet has
 * no column for adds one, and earlier rows get an empty cell there.
 */
export function appendRow(dataset: Dataset | undefined, captured: Array<{ field: string; value: string }>): Dataset {
  const base: Dataset = dataset ?? { name: "Saved rows", headers: [], rows: [], importedAt: new Date().toISOString() };
  const headers = [...base.headers];
  const values: string[] = new Array(headers.length).fill("");
  for (const { field, value } of captured) {
    let column = headers.findIndex((header) => header.toLowerCase() === field.toLowerCase());
    if (column < 0) {
      if (headers.length >= MAX_COLUMNS) continue;
      headers.push(field);
      values.push("");
      column = headers.length - 1;
    }
    values[column] = clean(value);
  }
  const rows = base.rows.map((row) => [...row, ...new Array(headers.length - row.length).fill("")]);
  return { ...base, headers, rows: [...rows, values].slice(-MAX_ROWS) };
}

export const datasetCsv = (dataset: Dataset): string => toCsv([dataset.headers, ...dataset.rows]);

export async function getDataset(): Promise<Dataset | undefined> {
  return (await chrome.storage.local.get(DATA_KEY))[DATA_KEY] as Dataset | undefined;
}

export async function saveDataset(dataset: Dataset | undefined): Promise<void> {
  if (dataset) await chrome.storage.local.set({ [DATA_KEY]: dataset });
  else await chrome.storage.local.remove([DATA_KEY, CURSOR_KEY]);
}

export async function getCursor(): Promise<DatasetCursor> {
  const stored = (await chrome.storage.local.get(CURSOR_KEY))[CURSOR_KEY] as Partial<DatasetCursor> | undefined;
  const next = Number.isInteger(stored?.next) && (stored?.next ?? -1) >= 0 ? stored!.next! : 0;
  const last = Number.isInteger(stored?.last) ? stored!.last! : null;
  return { next, last };
}

export const saveCursor = (cursor: DatasetCursor): Promise<void> => chrome.storage.local.set({ [CURSOR_KEY]: cursor });

export const DATASET_KEYS = [DATA_KEY, CURSOR_KEY] as const;

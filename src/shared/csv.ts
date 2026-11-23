/** Reads CSV as Excel and Google Sheets write it: quoted cells may hold separators, quotes and line breaks. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const separator = detectSeparator(source);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"' && cell === "") quoted = true;
    else if (char === separator) { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Comma, semicolon or tab, whichever the header line uses most. Spreadsheets in many countries save with semicolons. */
function detectSeparator(text: string): string {
  const firstLine = text.slice(0, text.search(/\r|\n|$/));
  const counts = [",", ";", "\t"].map((separator) => [separator, firstLine.split(separator).length - 1] as const);
  return counts.reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];
}

/** Writes rows back as CSV that Excel opens correctly, quoting only cells that need it. */
export function toCsv(rows: string[][]): string {
  const quote = (cell: string): string => (/[",\r\n]/.test(cell) || /^\s|\s$/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
  return rows.map((row) => row.map(quote).join(",")).join("\r\n");
}

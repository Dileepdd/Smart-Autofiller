/**
 * A CSV reader written into generated JavaScript and TypeScript tests, so a data-driven test needs no
 * extra package. It reads quoted cells with commas, quotes and line breaks, and returns one object per row.
 */
export const jsCsvReader = (typed: boolean): string => `/** Reads CSV into one object per row, keyed by the header row. */
function readCsv(text${typed ? ": string): Record<string, string>[]" : ")"} {
  const rows${typed ? ": string[][]" : ""} = [];
  let row${typed ? ": string[]" : ""} = [], cell = '', quoted = false;
  text = text.replace(/^\\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\\n' || c === '\\r') {
      if (c === '\\r' && text[i + 1] === '\\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const [headers, ...data] = rows.filter((r) => r.some((value) => value !== ''));
  return data.map((r) => Object.fromEntries(headers.map((header, index) => [header, r[index] ?? ''])));
}`;

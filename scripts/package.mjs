import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

const source = "dist";
const outdir = "release";

const ZIP_VERSION = 20;
const UTF8_NAMES = 0x0800;
const DEFLATE = 8;
// A fixed date, 1 January 1980, so the same build always gives the same zip.
const DOS_DATE = 0x0021;

/** Writes [size, value] pairs as little-endian fields. */
function fields(...pairs) {
  const buffer = Buffer.alloc(pairs.reduce((total, [size]) => total + size, 0));
  let offset = 0;
  for (const [size, value] of pairs) {
    buffer.writeUIntLE(value, offset, size);
    offset += size;
  }
  return buffer;
}

async function zipEntries() {
  const items = await readdir(source, { recursive: true, withFileTypes: true });
  const paths = items.filter((item) => item.isFile()).map((item) => join(item.parentPath, item.name)).sort();
  return Promise.all(paths.map(async (path) => {
    const data = await readFile(path);
    return {
      name: Buffer.from(relative(source, path).replaceAll("\\", "/")),
      crc: crc32(data),
      size: data.length,
      deflated: deflateRawSync(data, { level: 9 })
    };
  }));
}

function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, crc, size, deflated } of entries) {
    const shared = [[2, ZIP_VERSION], [2, UTF8_NAMES], [2, DEFLATE], [2, 0], [2, DOS_DATE], [4, crc], [4, deflated.length], [4, size], [2, name.length], [2, 0]];
    const local = Buffer.concat([fields([4, 0x04034b50], ...shared), name, deflated]);
    centrals.push(fields([4, 0x02014b50], [2, ZIP_VERSION], ...shared, [2, 0], [2, 0], [2, 0], [4, 0], [4, offset]), name);
    locals.push(local);
    offset += local.length;
  }
  const directory = Buffer.concat(centrals);
  const end = fields([4, 0x06054b50], [2, 0], [2, 0], [2, entries.length], [2, entries.length], [4, directory.length], [4, offset], [2, 0]);
  return Buffer.concat([...locals, directory, end]);
}

const { version } = JSON.parse(await readFile(join(source, "manifest.json"), "utf8"));
const entries = await zipEntries();
const output = join(outdir, `smart-autofill-${version}.zip`);
await mkdir(outdir, { recursive: true });
await writeFile(output, zip(entries));
console.log(`${output}: ${entries.length} files`);

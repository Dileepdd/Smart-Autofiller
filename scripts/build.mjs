import { build, context } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const watch = process.argv.includes("--watch");
const release = process.argv.includes("--release");
const firefox = process.argv.includes("--firefox");
const outdir = firefox ? "dist-firefox" : "dist";
// Firefox identifies an add-on by this for good, so it must not change after the first release.
const FIREFOX_ID = "smart-autofill-qa@dileepdd.github.io";

/** Firefox runs a background script instead of a service worker, and needs its own ID and data declaration. */
async function writeFirefoxManifest() {
  const path = `${outdir}/manifest.json`;
  const { minimum_chrome_version: _chromeOnly, ...manifest } = JSON.parse(await readFile(path, "utf8"));
  manifest.background = { scripts: ["background.js"] };
  manifest.browser_specific_settings = {
    gecko: { id: FIREFOX_ID, strict_min_version: "142.0", data_collection_permissions: { required: ["none"] } }
  };
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await cp("public", outdir, { recursive: true });

const common = {
  bundle: true,
  sourcemap: !release,
  target: "chrome120",
  logLevel: "info"
};

const jobs = [
  { entryPoints: ["src/popup/popup.ts"], outfile: `${outdir}/popup.js`, format: "iife", ...common },
  { entryPoints: ["src/background/index.ts"], outfile: `${outdir}/background.js`, format: "iife", ...common },
  { entryPoints: ["src/content/index.ts"], outfile: `${outdir}/content.js`, format: "iife", ...common },
  ...(await localeJobs())
];

/**
 * Each language's name data, injected only into a page that needs it. Only the parts a fill uses
 * are copied out of Faker here, because importing a whole Faker locale also pulls in data we never read.
 */
async function localeJobs() {
  const faker = await import("@faker-js/faker");
  const STREET_KEYS = ["building_number", "direction", "secondary_address", "street_address", "street_name", "street_pattern", "street_prefix", "street_suffix"];
  const sources = { DE: "de", FR: "fr", ES: "es", PT: "pt_PT", IT: "it", NL: "nl" };
  return Object.entries(sources).map(([code, name]) => {
    const { metadata, person, company, location = {} } = faker[name];
    const street = Object.fromEntries(STREET_KEYS.filter((key) => key in location).map((key) => [key, location[key]]));
    const data = JSON.stringify({ metadata, person, company, location: street });
    return {
      stdin: { contents: `import { registerLocale } from "./localeRegistry";\nregisterLocale("${code}", ${data});\n`, resolveDir: "src/generators", loader: "ts" },
      outfile: `${outdir}/locales/${code.toLowerCase()}.js`,
      format: "iife",
      ...common
    };
  });
}

await cp("src/popup/popup.html", `${outdir}/popup.html`);
await cp("src/popup/popup.html", `${outdir}/options.html`);
await cp("src/popup/popup.css", `${outdir}/popup.css`);
await cp("node_modules/@faker-js/faker/LICENSE", `${outdir}/LICENSE-faker.txt`);
if (firefox) await writeFirefoxManifest();

if (watch) {
  const contexts = await Promise.all(jobs.map((job) => context(job)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log("Watching source files. Reload the extension after rebuilds.");
} else {
  await Promise.all(jobs.map((job) => build(job)));
}
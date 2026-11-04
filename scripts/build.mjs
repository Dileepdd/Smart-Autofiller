import { build, context } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

const watch = process.argv.includes("--watch");
const outdir = "dist";

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
await cp("public/manifest.json", `${outdir}/manifest.json`);

const common = {
  bundle: true,
  sourcemap: true,
  target: "chrome120",
  logLevel: "info"
};

const jobs = [
  { entryPoints: ["src/popup/popup.ts"], outfile: `${outdir}/popup.js`, format: "iife", ...common },
  { entryPoints: ["src/content/index.ts"], outfile: `${outdir}/content.js`, format: "iife", ...common }
];

await cp("src/popup/popup.html", `${outdir}/popup.html`);
await cp("src/popup/popup.css", `${outdir}/popup.css`);

if (watch) {
  const contexts = await Promise.all(jobs.map((job) => context(job)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log("Watching source files. Reload the extension after rebuilds.");
} else {
  await Promise.all(jobs.map((job) => build(job)));
}
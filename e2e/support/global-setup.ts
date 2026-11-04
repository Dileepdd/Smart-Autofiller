import { build } from "esbuild";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer, Server } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DIST, FIXTURE_PORT, OTHER_ORIGIN_PORT } from "./paths";

const e2eRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generated = join(e2eRoot, ".generated");
const CONTENT_TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

async function buildFixtures(): Promise<void> {
  await rm(generated, { recursive: true, force: true });
  await mkdir(generated, { recursive: true });
  const fixtures = join(e2eRoot, "fixtures");
  const apps = { react: "react.jsx", vue: "vue.js", angular: "angular.js", libs: "libs.jsx", dates: "dates.jsx" };

  await build({
    entryPoints: Object.fromEntries(Object.entries(apps).map(([name, file]) => [name, join(fixtures, file)])),
    outdir: generated,
    bundle: true,
    format: "iife",
    jsx: "automatic",
    loader: { ".js": "jsx", ".woff": "dataurl", ".ttf": "dataurl" },
    logLevel: "error",
    define: {
      "process.env.NODE_ENV": '"production"',
      __VUE_OPTIONS_API__: "true",
      __VUE_PROD_DEVTOOLS__: "false",
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
      ngDevMode: "false"
    }
  });

  for (const name of await readdir(fixtures)) {
    if (name.endsWith(".html")) await cp(join(fixtures, name), join(generated, name));
  }
  for (const name of Object.keys(apps)) {
    const root = name === "angular" ? "<app-root></app-root>" : '<div id="root"></div><div id="vue"></div>';
    const styles = existsSync(join(generated, `${name}.css`)) ? `<link rel="stylesheet" href="/${name}.css">` : "";
    await writeFile(join(generated, `${name}.html`), `<!doctype html><html><head>${styles}</head><body>${root}<script src="/${name}.js"></script></body></html>`);
  }
}

const serve = (port: number): Promise<Server> => new Promise((ready) => {
  const server = createServer(async (request, response) => {
    try {
      const path = join(generated, new URL(request.url ?? "/", "http://localhost").pathname);
      response.setHeader("content-type", CONTENT_TYPES[extname(path)] ?? "application/octet-stream");
      response.end(await readFile(path));
    } catch {
      response.statusCode = 404;
      response.end();
    }
  }).listen(port, () => ready(server));
});

export default async function globalSetup(): Promise<() => void> {
  if (!existsSync(join(DIST, "manifest.json"))) throw new Error("dist/ is missing. Run `npm run build` first.");
  await buildFixtures();
  const servers = await Promise.all([serve(FIXTURE_PORT), serve(OTHER_ORIGIN_PORT)]);
  return () => servers.forEach((server) => server.close());
}

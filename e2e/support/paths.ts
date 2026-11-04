import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The unmodified build. Nothing in these tests may alter it or its manifest. */
export const DIST = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist");

export const FIXTURE_PORT = 4173;
export const OTHER_ORIGIN_PORT = 4174;

export const fixtureUrl = (name: string): string => `http://localhost:${FIXTURE_PORT}/${name}.html`;

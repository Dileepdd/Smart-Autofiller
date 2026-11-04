import { execFileSync } from "node:child_process";

// Uses the npm that started this script. Inside `npm run`, a bare `npm` can resolve to
// an older copy in any parent folder's node_modules/.bin, which cannot read this lockfile.
const npm = (...args) => execFileSync(process.execPath, [process.env.npm_execpath, ...args], { cwd: "e2e", stdio: "inherit" });

npm("ci");
npm("run", "install-browser");
